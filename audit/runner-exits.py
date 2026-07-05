#!/usr/bin/env python3
"""Re-measure the rule-compliant set with RUNNER exits (Alex's actual rule:
hold until daily close < 21EMA-low) instead of a fixed-3R cap, and log max
favorable excursion (MFE) to expose the right tail the 3R cap was hiding.
Last 3 months, medium subset. python3 audit/runner-exits.py"""
import json, re, os, urllib.request
from datetime import datetime, timedelta
CACHE = "audit/.cache2"
CUTOFF = (datetime.now() - timedelta(days=92)).strftime("%Y-%m-%d")

def load(s):
    p = f"{CACHE}/{s}.json"
    if os.path.exists(p): return json.load(open(p))
    try:
        p1 = int(datetime(2024,8,1).timestamp()); p2 = int(datetime.now().timestamp())
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{s}?period1={p1}&period2={p2}&interval=1d"
        j = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0"}), timeout=30))
        r = j["chart"]["result"][0]; q = r["indicators"]["quote"][0]
        b = [{"date": datetime.utcfromtimestamp(t).strftime("%Y-%m-%d"),"high":q["high"][i],"low":q["low"][i],"close":q["close"][i],"vol":q["volume"][i]}
             for i,t in enumerate(r["timestamp"]) if q["close"][i] is not None]
        json.dump(b, open(p,"w")); return b
    except Exception: return None
def ema(v,n):
    k=2/(n+1); out=[None]*len(v)
    if len(v)<n: return out
    s=sum(v[:n])/n; out[n-1]=s
    for i in range(n,len(v)): s=v[i]*k+s*(1-k); out[i]=s
    return out
def atr(b,n,i):
    if i<n: return None
    return sum(max(b[j]["high"]-b[j]["low"],abs(b[j]["high"]-b[j-1]["close"]),abs(b[j]["low"]-b[j-1]["close"])) for j in range(i-n+1,i+1))/n

qqq=load("QQQ"); qqqe=load("QQQE")
qc=[b["close"] for b in qqq]; qsma=ema(qc,50); qix={b["date"]:i for i,b in enumerate(qqq)}
def near(d,ix): return d if d in ix else (max([x for x in ix if x<=d], default=None))
def qpos(d):
    dd=near(d,qix); i=qix[dd] if dd else None; return (qc[i]>qsma[i]) if (i is not None and qsma[i]) else None
def qret(d,n):
    dd=near(d,qix); i=qix[dd] if dd else None; return qc[i]/qc[i-n]-1 if (i is not None and i>=n) else None
eh=ema([b["high"] for b in qqqe],21); ec=ema([b["close"] for b in qqqe],21); el=ema([b["low"] for b in qqqe],21)
qa={b["date"]:(b["close"]>max(eh[i],ec[i],el[i])) for i,b in enumerate(qqqe) if ec[i] is not None}
def strong(d):
    dd=near(d,qa); return bool(qa.get(dd)) and bool(qpos(d))

LCALL=re.compile(r'Long\s+([\d.]+)%\s+([A-Z]{1,6})\s+@\s+([\d.]+).*?SL\s*@\s*([\d.]+)',re.I|re.S)
rows=[]
for line in open("audit/gap-equity-trades.jsonl"):
    m=json.loads(line); date=m["timestamp"][:10]
    if date<CUTOFF: continue
    h=LCALL.search(m["content"])
    if not h: continue
    e,sl=float(h[3]),float(h[4])
    if e<=0 or e==sl: continue
    tkr=h[2].upper(); bars=load(tkr)
    if not bars: continue
    i0=next((i for i,b in enumerate(bars) if b["date"]>=date),None)
    if i0 is None or i0<25: continue
    p=i0-1
    e21=ema([b["close"] for b in bars[:p+1]],21)[p]; a14=atr(bars,14,p)
    if e21 is None or a14 in (None,0): continue
    t20=bars[p]["close"]/bars[p-20]["close"]-1 if p>=20 else None; q20=qret(bars[p]["date"],20)
    rs=(t20-q20) if (t20 is not None and q20 is not None) else -9
    dvol=sorted(b["close"]*(b["vol"] or 0) for b in bars[p-19:p+1])[10] if p>=19 else 0
    if not (dvol>=100e6 and rs>0 and -0.5<=(e-e21)/a14<=0.5 and strong(date)): continue  # MEDIUM filter
    risk=e-sl
    elow=ema([b["low"] for b in bars],21)
    # fixed 3R
    f3=None; tgt=e+3*risk
    for b in bars[i0:]:
        if b["low"]<=sl: f3=-1.0; break
        if b["high"]>=tgt: f3=3.0; break
    # runner: stop = max(posted SL, 21EMA-low), trail up, exit on close < stop
    stop=sl; trail=None; mfe=0.0
    for j in range(i0,len(bars)):
        b=bars[j]; mfe=max(mfe,(b["high"]-e)/risk)
        if elow[j] is not None: stop=max(stop,elow[j])
        if b["close"]<stop:
            trail=(b["close"]-e)/risk; break
    rows.append(dict(date=date,tkr=tkr,e=e,rs=rs,f3=f3,trail=trail,mfe=mfe,open=(trail is None)))

rows.sort(key=lambda c:c["date"])
def expval(vals): return sum(vals)/len(vals) if vals else 0
f3v=[c["f3"] for c in rows if c["f3"] is not None]
trv=[c["trail"] for c in rows if c["trail"] is not None]
print(f"\nMEDIUM subset, last 3 months ({CUTOFF}->today), n={len(rows)}  ({sum(c['open'] for c in rows)} still open)\n")
print(f"| {'Date':10} | {'Tkr':5} | {'RS%':>6} | {'fixed-3R':>8} | {'RUNNER R':>8} | {'MFE (R)':>7} | {'note':4} |")
print("|"+"|".join("-"*(w+2) for w in (10,5,6,8,8,7,4))+"|")
for c in rows:
    note = "RUN" if (c["trail"] or 0)>=5 or c["mfe"]>=5 else ("OPEN" if c["open"] else "")
    print(f"| {c['date']:10} | {c['tkr']:5} | {c['rs']*100:>+6.1f} | {('%+.1f'%c['f3']) if c['f3'] is not None else '  -':>8} | "
          f"{('%+.1f'%c['trail']) if c['trail'] is not None else 'open':>8} | {c['mfe']:>7.1f} | {note:4} |")
print(f"\nEXPECTANCY  fixed-3R: {expval(f3v):+.2f}R (n={len(f3v)})   |   RUNNER: {expval(trv):+.2f}R (n={len(trv)})")
top = sorted(rows, key=lambda c: (c["trail"] or 0), reverse=True)[:3]
tot = sum(c["trail"] for c in rows if c["trail"] is not None)
print(f"Total R (runner): {tot:+.1f}.  Top 3 trades = {sum(c['trail'] or 0 for c in top):+.1f}R "
      f"({', '.join(c['tkr'] for c in top)}) = {sum(c['trail'] or 0 for c in top)/tot*100 if tot else 0:.0f}% of it.")
print(f"Runners >=5R (closed): {sum(1 for c in rows if (c['trail'] or 0)>=5)}   |   trades whose MFE reached >=5R: {sum(1 for c in rows if c['mfe']>=5)}")
