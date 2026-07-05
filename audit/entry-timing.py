#!/usr/bin/env python3
"""
Does waiting for a pullback to the lower bound (21EMA-low band) improve returns?
Two tests on clean QQQ, 2012-2026:
  (1) Conditional forward returns: bucket every day by where price sits vs the
      21EMA structure (in ATR), measure forward 21d/63d returns. Tests the
      SHORT-TERM claim ("buying at the lower bound has better forward returns").
  (2) Monthly-contribution deployment (your SIPP reality): invest cash the day it
      arrives  vs  hold it and deploy on the next dip to the 21EMA-low band.
      Tests the LONG-RUN claim (does dip-buying beat just investing?).
Run: python3 audit/entry-timing.py
"""
import json, os, math
CACHE = "audit/.cachebt"
qqq = json.load(open(f"{CACHE}/QQQ.json"))
ds = sorted(qqq); C = [qqq[d]["c"] for d in ds]; H = [qqq[d]["h"] for d in ds]; L = [qqq[d]["l"] for d in ds]

def ema(v, n):
    k = 2/(n+1); out = [None]*len(v); s = None
    for i, x in enumerate(v):
        if i < n-1: continue
        s = sum(v[i-n+1:i+1])/n if s is None else x*k+s*(1-k); out[i] = s
    return out
def sma(v, n): return [None if i < n-1 else sum(v[i-n+1:i+1])/n for i in range(len(v))]

eC = ema(C, 21); eL = ema(L, 21); s200 = sma(C, 200)
ATR = [None]*len(C)
for i in range(14, len(C)):
    ATR[i] = sum(max(H[j]-L[j], abs(H[j]-C[j-1]), abs(L[j]-C[j-1])) for j in range(i-13, i+1))/14

# (1) conditional forward returns
def fwd(i, h): return (C[i+h]/C[i]-1) if i+h < len(C) else None
buckets = {"ALL days (uptrend)": [], "AT/below 21EMA (dist<=0)": [], "LOWER BAND (close<=21EMA-low)": [],
           "DEEP dip (dist<=-1.5 ATR)": [], "EXTENDED (dist>=+2 ATR)": []}
for i in range(200, len(C)-63):
    if None in (eC[i], eL[i], s200[i], ATR[i]) or ATR[i] == 0: continue
    if C[i] <= s200[i]: continue                      # uptrend filter only
    dist = (C[i]-eC[i])/ATR[i]
    f21, f63 = fwd(i, 21), fwd(i, 63)
    if f21 is None or f63 is None: continue
    rec = (f21, f63)
    buckets["ALL days (uptrend)"].append(rec)
    if dist <= 0: buckets["AT/below 21EMA (dist<=0)"].append(rec)
    if C[i] <= eL[i]: buckets["LOWER BAND (close<=21EMA-low)"].append(rec)
    if dist <= -1.5: buckets["DEEP dip (dist<=-1.5 ATR)"].append(rec)
    if dist >= 2: buckets["EXTENDED (dist>=+2 ATR)"].append(rec)

print("(1) FORWARD RETURNS BY ENTRY CONDITION  (QQQ, uptrend = above 200d SMA)\n")
print(f"  {'entry condition':32} {'n':>5} {'avg+21d':>8} {'win%21':>7} {'avg+63d':>8} {'win%63':>7}")
for k, v in buckets.items():
    n = len(v)
    a21 = sum(x[0] for x in v)/n; w21 = sum(1 for x in v if x[0] > 0)/n
    a63 = sum(x[1] for x in v)/n; w63 = sum(1 for x in v if x[1] > 0)/n
    print(f"  {k:32} {n:>5} {a21*100:>7.1f}% {w21*100:>6.0f}% {a63*100:>7.1f}% {w63*100:>6.0f}%")

# (2) monthly contribution: invest now vs wait for dip to 21EMA-low band
print("\n(2) MONTHLY £1000 CONTRIBUTION: invest on arrival vs wait-for-dip\n")
contrib_idx = list(range(210, len(C), 21))   # ~monthly
# invest now
sh_now = 0.0
for i in contrib_idx: sh_now += 1000/C[i]
val_now = sh_now*C[-1]
# wait for dip to lower band (close<=21EMA-low); deploy accumulated cash on first dip
def wait_dip(trigger):
    sh = 0.0; cash = 0.0; waiting_days = 0; deploys = 0; ci = set(contrib_idx)
    for i in range(210, len(C)):
        if i in ci: cash += 1000
        if cash > 0 and eL[i] is not None and ATR[i] and trigger(i):
            sh += cash/C[i]; cash = 0; deploys += 1
        if cash > 0: waiting_days += 1
    return sh*C[-1] + cash, cash, waiting_days, deploys
val_lb, cash_lb, wd_lb, dp_lb = wait_dip(lambda i: C[i] <= eL[i])
val_deep, cash_deep, wd_deep, dp_deep = wait_dip(lambda i: (C[i]-eC[i])/ATR[i] <= -0.5)
invested = 1000*len(contrib_idx)
print(f"  total contributed: £{invested:,}")
print(f"  {'strategy':40} {'final value':>13} {'multiple':>9}")
print(f"  {'Invest on arrival (DCA)':40} £{val_now:>11,.0f} {val_now/invested:>8.2f}x")
print(f"  {'Wait for dip to 21EMA-low band':40} £{val_lb:>11,.0f} {val_lb/invested:>8.2f}x   (uninvested cash left: £{cash_lb:,.0f}, ~{wd_lb} days waiting, {dp_lb} deploys)")
print(f"  {'Wait for dip dist<=-0.5 ATR':40} £{val_deep:>11,.0f} {val_deep/invested:>8.2f}x   (uninvested cash left: £{cash_deep:,.0f}, ~{wd_deep} days waiting, {dp_deep} deploys)")
