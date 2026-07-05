#!/usr/bin/env python3
"""Hypothetical-trades screen: apply Alex's OWN rulebook mechanically to his whole
watchlist, every day -- including the setups he SKIPPED -- to test whether the edge
is his discretion or just the rules, and to grow n past the 150 floor honestly.

Universe   = every ticker Alex ever called (his de-facto watchlist).
Trigger    = liquid leader ($vol>=100m) + RS band [0.05,0.20] + price within +/-0.5 ATR
             of a RISING 21EMA + strong regime. Fired on every qualifying day.
Entry/exit = enter at signal-day close; stop = entry - 1.5*ATR; fixed 3R target; daily
             bars; 10-day per-name cooldown. FX = USD account (0.10%).
Split      = signal within +/-3 trading days of a real Alex call -> "TOOK"; else "SKIPPED".

Run: python3 audit/strategy-golf/hypothetical-screen.py
"""
import sys, os, random; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))
import engine
random.seed(42)

RS_LO, RS_HI = 0.05, 0.20
FX = 0.10/100         # USD account
COOLDOWN = 10         # trading days between signals per name
ATR_STOP = 1.5
TARGET_R = 3
WIN_START, WIN_END = "2024-11-01", "2026-06-09"

calls = engine.load_calls()                    # (date,tkr,e,sl)
universe = sorted({t for _, t, _, _ in calls})
# actual-call index: ticker -> sorted list of bar-dates he called it
from collections import defaultdict
called = defaultdict(list)
for d, t, _, _ in calls:
    called[t].append(d)

def rising(ema, i, k=5):
    return i >= k and ema[i] is not None and ema[i-k] is not None and ema[i] > ema[i-k]

def near_call(tkr, bars, i):
    """True if Alex called tkr within +/-3 trading days of bar i."""
    for cd in called.get(tkr, []):
        j = next((k for k, b in enumerate(bars) if b["date"] >= cd), None)
        if j is not None and abs(j - i) <= 3:
            return True
    return False

trades = []
for tkr in universe:
    bars = engine.load(tkr)
    if not bars or len(bars) < 40:
        continue
    ec = [b["close"] for b in bars]
    e21 = engine.ema(ec, 21)
    e21low = engine.ema([b["low"] for b in bars], 21)
    last_sig = -10**9
    for i in range(30, len(bars)):
        b = bars[i]
        if not (WIN_START <= b["date"] <= WIN_END):
            continue
        if i - last_sig < COOLDOWN:
            continue
        a14 = engine.atr(bars, 14, i)
        if e21[i] is None or a14 in (None, 0) or not rising(e21, i):
            continue
        dist = (b["close"] - e21[i]) / a14
        if not (-0.5 <= dist <= 0.5):
            continue
        t20 = ec[i]/ec[i-20]-1 if i >= 20 else None
        q20 = engine.qret(b["date"], 20)
        rs = (t20 - q20) if (t20 is not None and q20 is not None) else -9
        if not (RS_LO <= rs <= RS_HI):
            continue
        dvol = sorted(x["close"]*(x["vol"] or 0) for x in bars[i-19:i+1])[10]
        if dvol < 100e6:
            continue
        if not engine.strong_regime(b["date"]):
            continue
        # fire
        last_sig = i
        entry = b["close"]; risk = ATR_STOP * a14; stop = entry - risk
        if risk <= 0:
            continue
        stop_pct = risk / entry
        tgt = entry + TARGET_R * risk
        R = None
        for nb in bars[i+1:]:
            if nb["low"] <= stop: R = -1.0; break
            if nb["high"] >= tgt: R = float(TARGET_R); break
        open_t = R is None
        if open_t: R = (bars[-1]["close"] - entry)/risk
        cost_R = FX/stop_pct
        trades.append(dict(date=b["date"], tkr=tkr, R=R, R_net=R-cost_R,
                           took=near_call(tkr, bars, i), open=open_t, q=engine.quarter(b["date"])))

def stats(ts, label):
    n = len(ts)
    if not n:
        print(f"{label:28} n=0"); return
    net = [t["R_net"] for t in ts]
    win = sum(1 for t in ts if t["R"] > 0)/n
    exp = sum(net)/n
    means = []
    for _ in range(8000):
        means.append(sum(net[random.randrange(n)] for _ in range(n))/n)
    means.sort(); lo, hi = means[200], means[7800]
    tot = sum(net)
    top3 = sum(sorted(net, reverse=True)[:3])
    conc = top3/tot if tot > 0 else None
    q = defaultdict(list)
    for t in ts: q[t["q"]].append(t["R_net"])
    qpos = sum(1 for v in q.values() if sum(v)/len(v) > 0)
    print(f"{label:28} n={n:4d}  win={win*100:4.1f}%  net={exp:+.3f}R  CI[{lo:+.2f},{hi:+.2f}]  "
          f"tot={tot:+6.1f}R  conc={conc if conc is None else round(conc,2)}  reg+={qpos}/{len(q)}")

print(f"\nUniverse: {len(universe)} names | mechanical signals fired: {len(trades)} "
      f"({sum(t['open'] for t in trades)} open)\n")
stats(trades,                                   "ALL mechanical signals")
stats([t for t in trades if t["took"]],         "  ...he TOOK (~near a call)")
stats([t for t in trades if not t["took"]],     "  ...he SKIPPED")
print("\n(USD 0.10% cost, stop=1.5ATR, fixed 3R. Goal bar: net OOS >= +0.176R, win >= 38%, n >= 150.)")
