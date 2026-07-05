#!/usr/bin/env python3
"""
COARSE crash-insurance overlay vs buy-and-hold (clean QQQ/SPY, 2012-2026).
Stay fully invested EXCEPT when all three risk-off signals fire together:
  - QQQE closes BELOW its 21EMA-low band (real structural break)
  - VIX above its 21EMA (vol spike)
  - SHY/HYG above its 21EMA (credit spreads widening)
Then -> cash. Re-enter when QQQE reclaims (close > its 21EMA-close).
Goal: dodge the >30% drawdowns, sacrifice little return, fire only a few times.
Cash=0% (conservative). Run: python3 audit/crash-overlay.py
"""
import json, os, math
from datetime import datetime
CACHE = "audit/.cachebt"
def L(s): return json.load(open(f"{CACHE}/{s}.json"))
qqqe = L("QQQE"); vix = L("_VIX"); hyg = L("HYG"); shy = L("SHY"); qqq = L("QQQ"); spy = L("SPY")
def ema(v, n):
    k = 2/(n+1); out = [None]*len(v); s = None
    for i, x in enumerate(v):
        if i < n-1: continue
        s = sum(v[i-n+1:i+1])/n if s is None else x*k+s*(1-k); out[i] = s
    return out

qd = sorted(qqqe); ec = ema([qqqe[d]["c"] for d in qd], 21); eL = ema([qqqe[d]["l"] for d in qd], 21)
qqqe_break = {qd[i]: qqqe[qd[i]]["c"] < eL[i] for i in range(len(qd)) if eL[i] is not None}
qqqe_reclaim = {qd[i]: qqqe[qd[i]]["c"] > ec[i] for i in range(len(qd)) if ec[i] is not None}
vd = sorted(vix); ve = ema([vix[d]["c"] for d in vd], 21); vix_off = {vd[i]: vix[vd[i]]["c"] > ve[i] for i in range(len(vd)) if ve[i] is not None}
cd = sorted(set(hyg) & set(shy)); rat = [shy[d]["c"]/hyg[d]["c"] for d in cd]; re_ = ema(rat, 21)
credit_off = {cd[i]: rat[i] > re_[i] for i in range(len(cd)) if re_[i] is not None}
def pri(d, m): ks = [x for x in m if x <= d]; return m[ks[-1]] if ks else None
def crash_off(d): return bool(pri(d, qqqe_break)) and bool(pri(d, vix_off)) and bool(pri(d, credit_off))
def reclaim(d): return bool(pri(d, qqqe_reclaim))

def run(inst, name):
    ds = [d for d in sorted(inst) if d >= "2012-04-01"]
    bh = ov = 1.0; invested = True; bh_c = []; ov_c = []; episodes = []; exit_d = None; exit_px = None
    days_in = 0
    for i in range(1, len(ds)):
        d0, d1 = ds[i-1], ds[i]; r = inst[d1]["c"]/inst[d0]["c"] - 1
        bh *= (1+r); bh_c.append(bh)
        if invested and crash_off(d0):
            invested = False; exit_d = d1; exit_px = inst[d1]["c"]
        elif (not invested) and reclaim(d0):
            invested = True
            episodes.append((exit_d, d1, inst[d1]["c"]/exit_px - 1))  # QQQ move while in cash
        days_in += invested
        ov *= (1 + (r if invested else 0.0)); ov_c.append(ov)
    if not invested: episodes.append((exit_d, ds[-1]+"(still out)", inst[ds[-1]]["c"]/exit_px - 1))
    def stat(c):
        n = len(c); cagr = c[-1]**(252/n)-1; peak = mdd = 0
        for v in c:
            peak = max(peak, v); mdd = max(mdd, (peak-v)/peak)
        rets = [c[j]/c[j-1]-1 for j in range(1, len(c))]; mu = sum(rets)/len(rets)
        vol = math.sqrt(sum((x-mu)**2 for x in rets)/len(rets)*252)
        return cagr, mdd, vol, (cagr/vol if vol else 0), c[-1]-1
    cb, mb, vb, sb, tb = stat(bh_c); co, mo, vo, so, to = stat(ov_c)
    print(f"\n### {name}")
    print(f"  {'':22} {'totRet':>7} {'CAGR':>6} {'maxDD':>6} {'vol':>5} {'Sharpe':>7} {'%in':>5}")
    print(f"  {'Buy & hold':22} {tb*100:>6.0f}% {cb*100:>5.1f}% {mb*100:>5.0f}% {vb*100:>4.0f}% {sb:>7.2f} {'100%':>5}")
    print(f"  {'Crash-insurance':22} {to*100:>6.0f}% {co*100:>5.1f}% {mo*100:>5.0f}% {vo*100:>4.0f}% {so:>7.2f} {days_in/(len(ds)-1)*100:>4.0f}%")
    print(f"  de-risk episodes ({len(episodes)}):  [exit -> reentry : QQQ/SPY move while in cash]")
    for ex, en, mv in episodes:
        flag = "DODGED" if mv < -0.03 else ("whipsaw" if mv > 0.03 else "~flat")
        print(f"     {ex} -> {en:24} {mv*100:>+6.1f}%  {flag}")

run(qqq, "QQQ (Nasdaq-100)")
run(spy, "SPY (S&P 500)")
print("\nNote: cash=0% (a ~4% gilt yield while out would improve the overlay further). Re-entry waits for QQQE to reclaim its 21EMA — deliberately gives back some of the bounce to avoid false re-entries.")
