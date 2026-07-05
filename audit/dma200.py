#!/usr/bin/env python3
"""
Simple 200-day MA timing rule vs buy-and-hold. Tested back to 2000 to include
the dot-com bust and GFC (where this rule earns its reputation), plus the
2012-2026 sub-period (benign bull) for honesty.
Rules: invested while close > 200d SMA, else cash. Daily and monthly (Faber)
variants. Cash=0% (conservative; realistic T-bill/gilt yield while out — esp.
4-5% in 2000-07 & 2023-26 — would materially HELP the timed result).
Run: python3 audit/dma200.py
"""
import json, os, urllib.request, urllib.parse, math
from datetime import datetime
CACHE = "audit/.cachebt"; os.makedirs(CACHE, exist_ok=True)
def fetch(sym, start=2000):
    safe = f"{sym.replace('^','_').replace('.','-')}_{start}"; p = f"{CACHE}/{safe}.json"
    if os.path.exists(p): return json.load(open(p))
    p1 = int(datetime(start, 1, 1).timestamp()); p2 = int(datetime.now().timestamp())
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?period1={p1}&period2={p2}&interval=1d"
    j = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0"}), timeout=40))
    r = j["chart"]["result"][0]; q = r["indicators"]["quote"][0]
    b = {datetime.utcfromtimestamp(t).strftime("%Y-%m-%d"): q["close"][i] for i,t in enumerate(r["timestamp"]) if q["close"][i] is not None}
    json.dump(b, open(p,"w")); return b

def sma(v,n): return [None if i<n-1 else sum(v[i-n+1:i+1])/n for i in range(len(v))]
def metrics(curve):
    n=len(curve); cagr=curve[-1]**(252/n)-1; peak=mdd=0
    for v in curve:
        peak=max(peak,v); mdd=max(mdd,(peak-v)/peak)
    rets=[curve[j]/curve[j-1]-1 for j in range(1,len(curve))]; mu=sum(rets)/len(rets)
    vol=math.sqrt(sum((x-mu)**2 for x in rets)/len(rets)*252)
    return cagr,mdd,vol,(cagr/vol if vol else 0),curve[-1]-1

def backtest(inst, mode, start_date):
    ds=sorted(inst); C=[inst[d] for d in ds]; s200=sma(C,200)
    # month-end indices
    monthend=set(i for i in range(len(ds)-1) if ds[i][:7]!=ds[i+1][:7])
    sub=[i for i in range(len(ds)) if ds[i]>=start_date and s200[i] is not None]
    i0=sub[0]
    bh=st=1.0; pos=1; sw=0; din=0; bh_c=[]; st_c=[]
    last_me_sig=1
    for i in range(i0+1,len(ds)):
        if ds[i]<start_date: continue
        r=C[i]/C[i-1]-1; bh*=(1+r); bh_c.append(bh)
        if mode=="bh": newpos=1
        elif mode=="daily": newpos=1 if (s200[i-1] and C[i-1]>s200[i-1]) else 0
        else: # monthly: decide at month-end, hold through next month
            if (i-1) in monthend and s200[i-1]: last_me_sig=1 if C[i-1]>s200[i-1] else 0
            newpos=last_me_sig
        if newpos!=pos: sw+=1; pos=newpos
        din+=pos; st*=(1+(r if pos else 0.0)); st_c.append(st)
    yrs=len(bh_c)/252
    return (bh_c if mode=="bh" else st_c), din/len(bh_c), sw, yrs

def report(name, inst, start_date, label):
    print(f"\n### {name}  (from {label})")
    print(f"  {'strategy':18} {'totRet':>8} {'CAGR':>6} {'maxDD':>6} {'vol':>5} {'Sharpe':>7} {'%in':>5} {'sw/yr':>6}")
    for mode,lbl in [("bh","Buy & hold"),("daily","200d daily"),("monthly","200d monthly")]:
        curve,frac,sw,yrs=backtest(inst,mode,start_date)
        cagr,mdd,vol,sh,tot=metrics(curve)
        print(f"  {lbl:18} {tot*100:>7.0f}% {cagr*100:>5.1f}% {mdd*100:>5.0f}% {vol*100:>4.0f}% {sh:>7.2f} {frac*100:>4.0f}% {sw/yrs:>6.1f}")

spy=fetch("SPY"); qqq=fetch("QQQ")
report("SPY (S&P 500)", spy, "2000-09-01", "2000 — incl. dot-com + GFC")
report("QQQ (Nasdaq-100)", qqq, "2000-09-01", "2000 — incl. -80% dot-com bust")
report("SPY (S&P 500)", spy, "2012-04-01", "2012 — benign bull only")
report("QQQ (Nasdaq-100)", qqq, "2012-04-01", "2012 — benign bull only")
print("\nNote: cash=0%. A realistic T-bill/gilt yield while out (esp. 4-5% in 2000-07 & 2023-26) would HELP the timed rows materially.")
