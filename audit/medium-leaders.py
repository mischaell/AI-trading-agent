#!/usr/bin/env python3
"""
"The medium": does Alex's RULE-COMPLIANT subset have an edge the full set buried?

Pre-specified filters from HIS OWN framework (not tuned):
  - Liquid Leader : avg daily $-volume (prior 20d) >= $100m AND 20d RS vs QQQ > 0
  - Clean 21EMA   : entry within +/-0.5 ATR of the 21EMA (his "pullback into structure" zone)
  - Strong regime : QQQE above its 21EMA cloud AND QQQ above its 50-day MA

Evaluated single-leg at near-zero IBKR cost (0.05%), targets 2R & 3R,
full sample + train/test split. Run: python3 audit/medium-leaders.py
"""
import json, re, os, urllib.request
from datetime import datetime
FXPCT = 0.05
CACHE = "audit/.cache2"
os.makedirs(CACHE, exist_ok=True)

def fetch(sym):
    p1 = int(datetime(2024, 8, 1).timestamp()); p2 = int(datetime.now().timestamp())
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}"
           f"?period1={p1}&period2={p2}&interval=1d")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    j = json.load(urllib.request.urlopen(req, timeout=30))
    r = j["chart"]["result"][0]; q = r["indicators"]["quote"][0]
    return [{"date": datetime.utcfromtimestamp(t).strftime("%Y-%m-%d"),
             "high": q["high"][i], "low": q["low"][i], "close": q["close"][i],
             "vol": q["volume"][i]}
            for i, t in enumerate(r["timestamp"]) if q["close"][i] is not None]

def load(sym):
    p = f"{CACHE}/{sym}.json"
    if os.path.exists(p): return json.load(open(p))
    try:
        b = fetch(sym); json.dump(b, open(p, "w")); return b
    except Exception:
        return None

def ema(v, n):
    k = 2/(n+1); out=[None]*len(v)
    if len(v) < n: return out
    s = sum(v[:n])/n; out[n-1]=s
    for i in range(n, len(v)): s = v[i]*k + s*(1-k); out[i]=s
    return out

def atr(bars, n, i):
    if i < n: return None
    return sum(max(bars[j]["high"]-bars[j]["low"],
                   abs(bars[j]["high"]-bars[j-1]["close"]),
                   abs(bars[j]["low"]-bars[j-1]["close"]))
               for j in range(i-n+1, i+1)) / n

LCALL = re.compile(r'Long\s+([\d.]+)%\s+([A-Z]{1,6})\s+@\s+([\d.]+).*?SL\s*@\s*([\d.]+)', re.I|re.S)
msgs = json.load(open("data/discord-exports/equity-trades.json"))["messages"]

qqq = load("QQQ"); qqqe = load("QQQE")
qclose = [b["close"] for b in qqq]; qsma50 = ema(qclose, 50)  # use EMA50 as trend proxy
qidx = {b["date"]: i for i, b in enumerate(qqq)}
def qpos(date):  # QQQ above its 50d trend?
    if date not in qidx:
        pr = [d for d in qidx if d <= date]; date = pr[-1] if pr else None
        if not date: return None
    i = qidx[date]; return (qclose[i] > qsma50[i]) if qsma50[i] else None
def qret(date, n):
    if date not in qidx:
        pr = [d for d in qidx if d <= date]; date = pr[-1] if pr else None
        if not date: return None
    i = qidx[date]; return qclose[i]/qclose[i-n]-1 if i >= n else None
eh = ema([b["high"] for b in qqqe], 21); ec = ema([b["close"] for b in qqqe], 21); el = ema([b["low"] for b in qqqe], 21)
qqqe_above = {b["date"]: (b["close"] > max(eh[i], ec[i], el[i])) for i, b in enumerate(qqqe) if ec[i] is not None}
def regime_strong(date):
    qa = qqqe_above.get(date) or qqqe_above.get(max([d for d in qqqe_above if d <= date], default=None), False)
    return bool(qa) and bool(qpos(date))

calls = []
for m in msgs:
    h = LCALL.search(m.get("content","") or "")
    if not h: continue
    e, sl = float(h[3]), float(h[4])
    if e <= 0 or e == sl: continue
    tkr = h[2].upper(); date = m["timestamp"][:10]; bars = load(tkr)
    if not bars: continue
    i0 = next((i for i,b in enumerate(bars) if b["date"] >= date), None)
    if i0 is None or i0 < 25: continue
    p = i0-1
    e21 = ema([b["close"] for b in bars[:p+1]], 21)[p]; a14 = atr(bars, 14, p)
    if e21 is None or a14 in (None, 0): continue
    t20 = bars[p]["close"]/bars[p-20]["close"]-1 if p >= 20 else None
    q20 = qret(bars[p]["date"], 20)
    dvol = sorted(b["close"]*(b["vol"] or 0) for b in bars[p-19:p+1])[10] if p >= 19 else 0  # median $vol
    risk = abs(e-sl)
    out = {}; resolve = {}
    for Rm in (2.0, 3.0):
        tgt = e + Rm*risk; g = None; rd = None
        for b in bars[i0:]:
            if b["low"] <= sl: g = -1.0; rd = b["date"]; break
            if b["high"] >= tgt: g = Rm; rd = b["date"]; break
        out[Rm] = g; resolve[Rm] = rd
    if out[2.0] is None or out[3.0] is None: continue
    calls.append(dict(date=date, tkr=tkr, e=e, sl=sl, risk=risk, dist=(e-e21)/a14,
                      rs=(t20-q20) if (t20 is not None and q20 is not None) else -9,
                      dvol=dvol, regime=regime_strong(date), stop=risk/e*100, g=out, resolve=resolve))

calls.sort(key=lambda c: c["date"]); split = calls[int(len(calls)*0.70)]["date"]
LIQUID = lambda c: c["dvol"] >= 100e6 and c["rs"] > 0
CLEAN  = lambda c: -0.5 <= c["dist"] <= 0.5
STRONG = lambda c: c["regime"]

def stat(rows, Rm):
    rows = [c for c in rows]; n = len(rows)
    if not n: return (0, 0.0, 0.0)
    win = sum(1 for c in rows if c["g"][Rm] > 0)/n
    net = sum(c["g"][Rm] - FXPCT/c["stop"] for c in rows)/n
    return (n, win, net)

def line(name, rows):
    out = [f"  {name:24}"]
    for Rm in (2.0, 3.0):
        n, w, net = stat(rows, Rm)
        tr = [c for c in rows if c["date"] < split]; te = [c for c in rows if c["date"] >= split]
        _, _, trn = stat(tr, Rm); en, ew, enet = stat(te, Rm)
        out.append(f"{Rm:g}R: n={n:<3} win={w:4.0%} full={net:+.2f} tr={trn:+.2f} oos(n{en})={enet:+.2f}")
    print(("  | ".join(out)))

print(f"Long calls: {len(calls)}   train<{split}<=test   cost {FXPCT}% single-leg (IBKR)\n")
print("Filters (pre-specified from Alex's framework):")
print("  Liquid Leader = $vol>=100m & RS>0 | Clean = entry +/-0.5 ATR of 21EMA | Strong = QQQE>cloud & QQQ>50dEMA\n")
line("BASELINE (all longs)", calls)
line("Liquid Leader only", [c for c in calls if LIQUID(c)])
line("Clean 21EMA only", [c for c in calls if CLEAN(c)])
line("Strong regime only", [c for c in calls if STRONG(c)])
medium = [c for c in calls if LIQUID(c) and CLEAN(c) and STRONG(c)]
print()
line(">>> THE MEDIUM (all 3)", medium)
print(f"\nRule-compliant share: {len(medium)}/{len(calls)} = {len(medium)/len(calls):.0%} of his calls meet all 3 of his own rules.")
print(f"(So {1-len(medium)/len(calls):.0%} of his trades break at least one of his own filters — your 'tests/contradicts' hunch, quantified.)")

# ---- robustness: is +0.54R real or could it be ~0? --------------------
import random
random.seed(42)
def boot(rows, Rm, iters=4000):
    vals = [c["g"][Rm] - FXPCT/c["stop"] for c in rows]
    ms = sorted(sum(random.choice(vals) for _ in vals)/len(vals) for _ in range(iters))
    return ms[int(iters*0.025)], ms[int(iters*0.975)]
print("\nROBUSTNESS — bootstrap 95% CI on THE MEDIUM full-sample expectancy:")
for Rm in (2.0, 3.0):
    lo, hi = boot(medium, Rm); n, w, net = stat(medium, Rm)
    print(f"  {Rm:g}R: {net:+.2f}R  95% CI [{lo:+.2f}, {hi:+.2f}]  {'(excludes 0 -> significant)' if lo>0 else '(includes 0 -> NOT significant)'}")
print("\nROBUSTNESS — MEDIUM @3R out-of-sample at different split points:")
for frac in (0.5, 0.6, 0.7, 0.8):
    sp = calls[int(len(calls)*frac)]["date"]
    te = [c for c in medium if c["date"] >= sp]
    n, w, net = stat(te, 3.0)
    print(f"  split {frac:.0%} ({sp}): oos n={n:<3} win={w:4.0%} net={net:+.2f}R")

# ---- the actual list: rule-compliant calls in the trailing 3 months ----
from datetime import datetime, timedelta
maxd = max(c["date"] for c in calls)
cutoff = (datetime.strptime(maxd, "%Y-%m-%d") - timedelta(days=92)).strftime("%Y-%m-%d")
recent = sorted([c for c in medium if c["date"] >= cutoff], key=lambda c: c["date"])
print(f"\n\nTHE 14% — rule-compliant calls {cutoff} -> {maxd} (export ends {maxd}):")
print(f"  {'date':10} {'tkr':5} {'entry':>8} {'SL':>8} {'3R tgt':>8} {'distATR':>7} {'RS%':>6} {'$vol(m)':>8} {'3R out':>7} {'R':>5} {'resolved':>10}")
for c in recent:
    tgt3 = c["e"] + 3*c["risk"]
    res = "TARGET" if c["g"][3.0] > 0 else "stop"
    print(f"  {c['date']:10} {c['tkr']:5} {c['e']:>8.2f} {c['sl']:>8.2f} {tgt3:>8.2f} "
          f"{c['dist']:>+7.2f} {c['rs']*100:>+6.1f} {c['dvol']/1e6:>8.0f} {res:>7} {c['g'][3.0]:>+5.1f} {str(c['resolve'][3.0]):>10}")
print(f"  ({len(recent)} qualifying calls in the window)")
