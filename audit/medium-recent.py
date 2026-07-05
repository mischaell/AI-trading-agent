#!/usr/bin/env python3
"""Regenerate the rule-compliant ('the 14%') list for the REAL last 3 months,
using the freshly-pulled gap calls (audit/gap-equity-trades.jsonl). Includes
still-OPEN trades (the live setups). Clean fixed-width table."""
import json, re, os, urllib.request
from datetime import datetime, timedelta
CACHE = "audit/.cache2"; os.makedirs(CACHE, exist_ok=True)
CUTOFF = (datetime.now() - timedelta(days=92)).strftime("%Y-%m-%d")

def fetch(sym):
    p1 = int(datetime(2024, 8, 1).timestamp()); p2 = int(datetime.now().timestamp())
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?period1={p1}&period2={p2}&interval=1d"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    j = json.load(urllib.request.urlopen(req, timeout=30)); r = j["chart"]["result"][0]; q = r["indicators"]["quote"][0]
    return [{"date": datetime.utcfromtimestamp(t).strftime("%Y-%m-%d"), "high": q["high"][i], "low": q["low"][i],
             "close": q["close"][i], "vol": q["volume"][i]} for i, t in enumerate(r["timestamp"]) if q["close"][i] is not None]

def load(sym, refresh=False):
    p = f"{CACHE}/{sym}.json"
    if os.path.exists(p) and not refresh: return json.load(open(p))
    try: b = fetch(sym); json.dump(b, open(p, "w")); return b
    except Exception: return None

def ema(v, n):
    k = 2/(n+1); out=[None]*len(v)
    if len(v) < n: return out
    s = sum(v[:n])/n; out[n-1]=s
    for i in range(n, len(v)): s = v[i]*k + s*(1-k); out[i]=s
    return out
def atr(b, n, i):
    if i < n: return None
    return sum(max(b[j]["high"]-b[j]["low"], abs(b[j]["high"]-b[j-1]["close"]), abs(b[j]["low"]-b[j-1]["close"])) for j in range(i-n+1, i+1))/n

# refresh QQQ/QQQE so regime/outcomes reflect data through today
qqq = load("QQQ", refresh=True); qqqe = load("QQQE", refresh=True)
qclose = [b["close"] for b in qqq]; qsma = ema(qclose, 50); qidx = {b["date"]: i for i, b in enumerate(qqq)}
def _near(date, idx):
    if date in idx: return date
    pr = [d for d in idx if d <= date]; return pr[-1] if pr else None
def qpos(date):
    d = _near(date, qidx); i = qidx[d] if d else None
    return (qclose[i] > qsma[i]) if (i is not None and qsma[i]) else None
def qret(date, n):
    d = _near(date, qidx); i = qidx[d] if d else None
    return qclose[i]/qclose[i-n]-1 if (i is not None and i >= n) else None
eh = ema([b["high"] for b in qqqe], 21); ec = ema([b["close"] for b in qqqe], 21); el = ema([b["low"] for b in qqqe], 21)
qa = {b["date"]: (b["close"] > max(eh[i], ec[i], el[i])) for i, b in enumerate(qqqe) if ec[i] is not None}
def strong(date):
    d = _near(date, qa); return bool(qa.get(d)) and bool(qpos(date))

LCALL = re.compile(r'Long\s+([\d.]+)%\s+([A-Z]{1,6})\s+@\s+([\d.]+).*?SL\s*@\s*([\d.]+)', re.I | re.S)
rows = []
for line in open("audit/gap-equity-trades.jsonl"):
    m = json.loads(line); date = m["timestamp"][:10]
    if date < CUTOFF: continue
    h = LCALL.search(m["content"])
    if not h: continue
    e, sl = float(h[3]), float(h[4])
    if e <= 0 or e == sl: continue
    tkr = h[2].upper(); bars = load(tkr)
    if not bars: continue
    i0 = next((i for i, b in enumerate(bars) if b["date"] >= date), None)
    if i0 is None or i0 < 25: continue
    p = i0-1
    e21 = ema([b["close"] for b in bars[:p+1]], 21)[p]; a14 = atr(bars, 14, p)
    if e21 is None or a14 in (None, 0): continue
    t20 = bars[p]["close"]/bars[p-20]["close"]-1 if p >= 20 else None; q20 = qret(bars[p]["date"], 20)
    rs = (t20-q20) if (t20 is not None and q20 is not None) else -9
    dvol = sorted(b["close"]*(b["vol"] or 0) for b in bars[p-19:p+1])[10] if p >= 19 else 0
    risk = abs(e-sl); tgt3 = e + 3*risk; status, R, rd = "OPEN", None, ""
    for b in bars[i0:]:
        if b["low"] <= sl: status, R, rd = "STOP", -1.0, b["date"]; break
        if b["high"] >= tgt3: status, R, rd = "TARGET", 3.0, b["date"]; break
    rows.append(dict(date=date, tkr=tkr, e=e, sl=sl, tgt3=tgt3, dist=(e-e21)/a14, rs=rs, dvol=dvol,
                     regime=strong(date), stop=risk/e*100, status=status, R=R, rd=rd))

LIQUID = lambda c: c["dvol"] >= 100e6 and c["rs"] > 0
CLEAN  = lambda c: -0.5 <= c["dist"] <= 0.5
STRONG = lambda c: c["regime"]
med = sorted([c for c in rows if LIQUID(c) and CLEAN(c) and STRONG(c)], key=lambda c: c["date"])

print(f"\nREAL LAST 3 MONTHS  ({CUTOFF} -> today).  Long-calls in window: {len(rows)}   rule-compliant: {len(med)} ({len(med)/max(len(rows),1):.0%})\n")
hdr = f"| {'Date':10} | {'Ticker':6} | {'Entry':>8} | {'Stop':>8} | {'3R Target':>9} | {'ΔEMA(atr)':>9} | {'RS%':>6} | {'$Vol(m)':>7} | {'Status':6} | {'R':>4} |"
sep = "|" + "|".join("-"*(w+2) for w in (10,6,8,8,9,9,6,7,6,4)) + "|"
print(hdr); print(sep)
res = [c for c in med if c["status"] in ("TARGET","STOP")]
for c in med:
    print(f"| {c['date']:10} | {c['tkr']:6} | {c['e']:>8.2f} | {c['sl']:>8.2f} | {c['tgt3']:>9.2f} | "
          f"{c['dist']:>+9.2f} | {c['rs']*100:>+6.1f} | {c['dvol']/1e6:>7.0f} | {c['status']:6} | {('%+.0f'%c['R']) if c['R'] is not None else '  -':>4} |")
wins = sum(1 for c in res if c['R'] > 0)
print(f"\nResolved {len(res)} of {len(med)} (rest still OPEN/live).  ", end="")
if res: print(f"Wins {wins}/{len(res)} = {wins/len(res):.0%},  expectancy {sum(c['R'] for c in res)/len(res):+.2f}R @3R.")
else: print("none resolved yet.")
