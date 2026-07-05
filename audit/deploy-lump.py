#!/usr/bin/env python3
"""
How to deploy a lump when the market is EXTENDED. Tests, from every historical
'extended' start (close >= 21EMA + 2*ATR, and above 200d = uptrend), four
schedules, with undeployed cash earning 4% APY (CSH2):
   LUMP now | DCA 6mo | DCA 12mo | ACCEL (1/3 now + 1/3 on each pullback to 21EMA)
Measured at +1yr and +3yr. Also shows ALL-uptrend starts for contrast.
QQQ/SPY 2000-2026. Run: python3 audit/deploy-lump.py
"""
import json, statistics as st
CACHE = "audit/.cachebt"
CASH_D = 1.04**(1/252) - 1   # ~4% APY daily (CSH2)

def load(s): d = json.load(open(f"{CACHE}/{s}.json")); ds = sorted(d); return ds, [d[x] for x in ds]
def ema(v, n):
    k = 2/(n+1); o = [None]*len(v); s = None
    for i, x in enumerate(v):
        if i < n-1: continue
        s = sum(v[i-n+1:i+1])/n if s is None else x*k+s*(1-k); o[i] = s
    return o
def sma(v, n): return [None if i < n-1 else sum(v[i-n+1:i+1])/n for i in range(len(v))]

def deploy_value(C, t, H, offsets, fracs):
    """value per £1 nominal: each frac sits in cash CASH_D/day until its offset, then buys shares."""
    v = 0.0
    for off, fr in zip(offsets, fracs):
        eff = fr * (1+CASH_D)**off          # cash interest while waiting
        v += eff / C[t+off] * C[t+H]        # shares * price at horizon
    return v

def pullback_offsets(C, eC, t, H):
    offs = [0]; last = 0
    for _ in range(2):                       # two more tranches on dips
        o = next((k for k in range(last+1, H+1) if eC[t+k] and C[t+k] <= eC[t+k]), None)
        if o is None: o = min(last + 126, H)  # fallback: 6mo after last
        offs.append(o); last = o
    return offs

def run(name, sym):
    ds, C = load(sym); n = len(C)
    eC = ema(C, 21); s200 = sma(C, 200)
    ATR = [None]*n
    for i in range(14, n):
        ATR[i] = sum(max(C[j]-C[j], abs(0))  # placeholder, replaced below
                     for j in range(i, i+1))
    # proper ATR from close-only proxy unavailable; use high/low not stored -> use close-to-close range proxy
    # (cachebt stores close only) -> approximate ATR with 14d stdev of daily moves * scale
    rets = [0.0]+[abs(C[i]/C[i-1]-1)*C[i] for i in range(1, n)]
    for i in range(20, n):
        ATR[i] = sum(rets[i-13:i+1])/14
    def extended(t): return eC[t] and ATR[t] and s200[t] and C[t] >= eC[t]+2*ATR[t] and C[t] > s200[t]
    def uptrend(t):  return s200[t] and C[t] > s200[t]
    for cond_name, cond in [("EXTENDED starts (>=2ATR over 21EMA, uptrend)", extended),
                            ("ALL uptrend starts (contrast)", uptrend)]:
        for H, hl in [(252, "1yr"), (756, "3yr")]:
            starts = [t for t in range(210, n-H) if cond(t)]
            if not starts: continue
            res = {"LUMP": [], "DCA6": [], "DCA12": [], "ACCEL": []}
            for t in starts:
                res["LUMP"].append(deploy_value(C, t, H, [0], [1.0]))
                res["DCA6"].append(deploy_value(C, t, H, [21*i for i in range(6)], [1/6]*6))
                res["DCA12"].append(deploy_value(C, t, H, [21*i for i in range(12)], [1/12]*12))
                po = pullback_offsets(C, eC, t, H); res["ACCEL"].append(deploy_value(C, t, H, po, [1/3]*3))
            print(f"\n[{name}] {cond_name} — horizon {hl}  (n={len(starts)} starts)")
            print(f"  {'strategy':8} {'mean':>7} {'median':>7} {'p10(bad)':>9} {'p90':>7}  {'% beats LUMP':>13}")
            lump = res["LUMP"]
            for k in ["LUMP", "DCA6", "DCA12", "ACCEL"]:
                v = res[k]; vs = sorted(v)
                p10 = vs[len(vs)//10]; p90 = vs[len(vs)*9//10]
                beat = sum(1 for a, b in zip(v, lump) if a > b)/len(v)*100
                print(f"  {k:8} {st.mean(v):>6.2f}x {st.median(v):>6.2f}x {p10:>8.2f}x {p90:>6.2f}x  {beat:>12.0f}%")

run("QQQ", "QQQ_2000")
run("SPY", "SPY_2000")
print("\nNote: ATR approximated from close-only data (cachebt stores closes); cash=4% APY (CSH2). 'p10' = 10th-percentile (bad-case) outcome.")
