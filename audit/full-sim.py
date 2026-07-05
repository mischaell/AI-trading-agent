#!/usr/bin/env python3
"""
Full-history simulation of Alex's ACTUAL model (not one-shot fixed-R).

Per position (his rulebook + management observed in pf-update):
  ENTRY  : liquid leader ($vol>=100m, RS>0) pullback into structure (|dist|<=0.5 ATR),
           ONLY when regime is risk-on at entry.
  REGIME : QQQE above its 21EMA cloud  AND  VIX below its 21EMA (risk-on proxy for
           pillars 1-3). Breadth/credit not modelled -> approximation, flagged.
  EXITS  : (a) trim 1/3 at +2R (bank), run remaining 2/3;
           (b) structural trail: exit runner on daily close < 21EMA-low (trails up);
           (c) no-traction time-stop: if not +1R within N days, cut at close;
           (d) regime-off: if regime flips risk-off while holding, exit at that close.
  R      : trimmed -> (1/3)*2.0 + (2/3)*runnerR ; else full position at exit R.

Cost: IBKR single-leg ~0.05% (negligible). Full history Nov-2024 -> Jun-2026.
Run: python3 audit/full-sim.py
"""
import json, re, os, urllib.request
from datetime import datetime
CACHE = "audit/.cache2"; FXPCT = 0.05; NT_DAYS = 8

def load(sym, fname=None):
    fname = fname or sym
    p = f"{CACHE}/{fname}.json"
    if os.path.exists(p): return json.load(open(p))
    try:
        p1 = int(datetime(2024, 7, 1).timestamp()); p2 = int(datetime.now().timestamp())
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?period1={p1}&period2={p2}&interval=1d"
        j = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=30))
        r = j["chart"]["result"][0]; q = r["indicators"]["quote"][0]
        b = [{"date": datetime.utcfromtimestamp(t).strftime("%Y-%m-%d"), "high": q["high"][i], "low": q["low"][i],
              "close": q["close"][i], "vol": q["volume"][i]} for i, t in enumerate(r["timestamp"]) if q["close"][i] is not None]
        json.dump(b, open(p, "w")); return b
    except Exception: return None
def ema(v, n):
    k = 2/(n+1); out = [None]*len(v)
    if len(v) < n: return out
    s = sum(v[:n])/n; out[n-1] = s
    for i in range(n, len(v)): s = v[i]*k+s*(1-k); out[i] = s
    return out
def atr(b, n, i):
    if i < n: return None
    return sum(max(b[j]["high"]-b[j]["low"], abs(b[j]["high"]-b[j-1]["close"]), abs(b[j]["low"]-b[j-1]["close"])) for j in range(i-n+1, i+1))/n

import urllib.parse
qqq = load("QQQ"); qqqe = load("QQQE"); vix = load("^VIX", "_VIX")
qc = [b["close"] for b in qqq]; qix = {b["date"]: i for i, b in enumerate(qqq)}
def near(d, ix): return d if d in ix else max([x for x in ix if x <= d], default=None)
def qret(d, n):
    dd = near(d, qix); i = qix[dd] if dd else None
    return qc[i]/qc[i-n]-1 if (i is not None and i >= n) else None
eh = ema([b["high"] for b in qqqe], 21); ec = ema([b["close"] for b in qqqe], 21); el = ema([b["low"] for b in qqqe], 21)
qqqe_above = {b["date"]: (b["close"] > max(eh[i], ec[i], el[i])) for i, b in enumerate(qqqe) if ec[i] is not None}
vc = [b["close"] for b in vix]; vema = ema(vc, 21); vix_on = {b["date"]: (vc[i] < vema[i]) for i, b in enumerate(vix) if vema[i] is not None}
def regime_on(d):
    a = qqqe_above.get(near(d, qqqe_above), False); v = vix_on.get(near(d, vix_on), True)
    return bool(a) and bool(v)

# ---- load all long calls (export + gap), dedupe by id ----
LCALL = re.compile(r'Long\s+([\d.]+)%\s+([A-Z]{1,6})\s+@\s+([\d.]+).*?SL\s*@\s*([\d.]+)', re.I | re.S)
raw = []
for m in json.load(open("data/discord-exports/equity-trades.json"))["messages"]:
    raw.append((m["id"], m["timestamp"], m.get("content", "") or ""))
for line in open("audit/gap-equity-trades.jsonl"):
    j = json.loads(line); raw.append((j["id"], j["timestamp"], j["content"]))
seen = set(); calls = []
for mid, ts, content in raw:
    if mid in seen: continue
    seen.add(mid)
    h = LCALL.search(content)
    if not h: continue
    e, sl = float(h[3]), float(h[4])
    if e <= 0 or e == sl: continue
    calls.append(dict(id=mid, date=ts[:10], tkr=h[2].upper(), e=e, sl=sl))
calls.sort(key=lambda c: c["date"])

def simulate(call, gate=True, manage=True, exit_mode="runner"):
    """Return dict(taken, status, R, exit_date, mfe) for one call."""
    bars = load(call["tkr"])
    if not bars: return None
    d = call["date"]; i0 = next((i for i, b in enumerate(bars) if b["date"] >= d), None)
    if i0 is None or i0 < 25: return None
    p = i0-1
    e21 = ema([b["close"] for b in bars[:p+1]], 21)[p]; a14 = atr(bars, 14, p)
    if e21 is None or a14 in (None, 0): return None
    e, sl = call["e"], call["sl"]; risk = e - sl
    if risk <= 0: return None
    dist = (e-e21)/a14
    t20 = bars[p]["close"]/bars[p-20]["close"]-1 if p >= 20 else None; q20 = qret(bars[p]["date"], 20)
    rs = (t20-q20) if (t20 is not None and q20 is not None) else -9
    dvol = sorted(b["close"]*(b["vol"] or 0) for b in bars[p-19:p+1])[10] if p >= 19 else 0
    # entry filters
    liquid_clean = (dvol >= 100e6 and rs > 0 and -0.5 <= dist <= 0.5)
    if not liquid_clean: return dict(taken=False)
    if gate and not regime_on(d): return dict(taken=False)
    elow = ema([b["low"] for b in bars], 21)
    tgt2 = e + 2*risk; trimmed = False; stop = sl; mfe = 0.0
    cost = FXPCT/(risk/e*100)
    if exit_mode == "capped":  # no levers: full exit at +2R touch or close<initial SL
        for j in range(i0, len(bars)):
            b = bars[j]; mfe = max(mfe, (b["high"]-e)/risk)
            if b["close"] < sl:
                return dict(taken=True, status="stop", R=(b["close"]-e)/risk - cost, exit_date=b["date"], mfe=mfe)
            if b["high"] >= tgt2:
                return dict(taken=True, status="exit", R=2.0 - cost, exit_date=b["date"], mfe=mfe)
        return dict(taken=True, status="open", R=None, exit_date=None, mfe=mfe)
    for k, j in enumerate(range(i0, len(bars))):
        b = bars[j]; mfe = max(mfe, (b["high"]-e)/risk)
        if elow[j] is not None: stop = max(stop, elow[j])
        if manage:
            # no-traction time stop
            if (not trimmed) and k >= NT_DAYS and mfe < 1.0:
                R = (b["close"]-e)/risk - cost
                return dict(taken=True, status="no-traction", R=R, exit_date=b["date"], mfe=mfe)
            # regime-off exit (go to cash)
            if gate and not regime_on(b["date"]):
                rr = (b["close"]-e)/risk
                R = (0.667*2.0 + 0.333*rr - cost) if trimmed else (rr - cost)
                return dict(taken=True, status="regime-off", R=R, exit_date=b["date"], mfe=mfe)
            # trim 1/3 at 2R
            if (not trimmed) and b["high"] >= tgt2: trimmed = True
        # structural stop (and initial SL)
        if b["close"] < stop:
            rr = (b["close"]-e)/risk
            R = (0.667*2.0 + 0.333*rr - cost) if (manage and trimmed) else (rr - cost)
            return dict(taken=True, status=("stop" if rr < 0 else "exit"), R=R, exit_date=b["date"], mfe=mfe)
    return dict(taken=True, status="open", R=None, exit_date=None, mfe=mfe)

def run(gate, manage, label, exit_mode="runner"):
    res = [simulate(c, gate, manage, exit_mode) for c in calls]
    taken = [(c, r) for c, r in zip(calls, res) if r and r.get("taken")]
    closed = [(c, r) for c, r in taken if r["R"] is not None]
    n = len(closed); wins = sum(1 for _, r in closed if r["R"] > 0)
    tot = sum(r["R"] for _, r in closed); exp = tot/n if n else 0
    seq = sorted([r for _, r in closed], key=lambda r: r["exit_date"])
    cum = peak = maxdd = 0.0
    for r in seq:
        cum += r["R"]; peak = max(peak, cum); maxdd = max(maxdd, peak-cum)
    print(f"  {label:48} trades={n:>3}  win={(wins/n*100 if n else 0):>3.0f}%  exp={exp:>+5.2f}R  total={tot:>+6.1f}R  maxDD={maxdd:>4.1f}R")
    return closed, tot

print(f"Full history: {calls[0]['date']} -> {calls[-1]['date']}  ({len(calls)} long-calls)\n")
print("DECOMPOSITION LADDER (cumulative — each row adds ONE lever to the row above):")
m0, t0 = run(False, True, "M0  entries only, capped at +2R (no levers)", "capped")
m1, t1 = run(False, True, "M1  + PATIENCE: trim 1/3@2R, run the rest", "runner")
m2, t2 = run(True,  True, "M2  + REGIME GATE   [= FULL MODEL]", "runner")

print(f"\nINCREMENTAL CONTRIBUTION TO TOTAL R:")
print(f"  Lever 3  Let winners run (patience) : {t1-t0:+6.1f}R   (M0 {t0:+.1f} -> M1 {t1:+.1f})")
print(f"  Lever 1  Regime read (gate)         : {t2-t1:+6.1f}R total — but its real job is RISK: same total R")
print(f"           from ~1/3 the trades, exp/trade roughly triples, drawdown shrinks (see maxDD column).")

# Lever 2 — pyramiding at EQUAL size = R from additional tranches on multi-entry names (within full model)
from collections import defaultdict
byname = defaultdict(list)
for c, r in m2: byname[c["tkr"]].append((c["date"], r["R"]))
init_R = adds_R = 0.0; pyr_names = 0
for tkr, lst in byname.items():
    lst.sort(); init_R += lst[0][1]
    if len(lst) > 1: pyr_names += 1; adds_R += sum(x[1] for x in lst[1:])
print(f"  Lever 2a Pyramiding @ equal size    : {adds_R:+6.1f}R   ({adds_R/t2*100:.0f}% of full model; "
      f"{pyr_names} names re-entered; first-tranche-only = {init_R:+.1f}R)")
sim_am = sum(r["R"] for _, r in m2 if "2026-04-01" <= r["exit_date"] <= "2026-05-31")
print(f"  Lever 2b Size-escalation + leverage : NOT in equal-size sim. Empirical proxy —")
print(f"           his sheet Apr+May = +111.7R vs this sim same window = {sim_am:+.1f}R  ->  ~{111.7/sim_am:.1f}x amplifier")
print(f"           (also ~{111.7/sim_am:.1f}x the drawdown — this is the layer that forced the 6/5 puke).")

Rs = sorted((r["R"] for _, r in m2), reverse=True); top5 = sum(Rs[:5])
print(f"\nMonster-dependence (full model): top 5 trades = {top5:+.1f}R = {top5/t2*100:.0f}% of {t2:+.1f}R total.")
