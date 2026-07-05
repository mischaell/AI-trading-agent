#!/usr/bin/env python3
"""
Regime-timed index vs buy-and-hold. Clean US underlying (QQQ/SPY) — the GBP
currency overlay on EQQQ.L/VUSA.L washes out of a timed-vs-B&H comparison, and
US data is clean (London .L lines had bad ticks).

Signals (Alex regime read, daily close, no lookahead — decide on prior close):
  smooth : QQQE close > its 21EMA(close)        [trend, low-whipsaw]
  cloud  : QQQE close > max(21EMA high/close/low) [his strict 'above structure']
  full   : smooth AND VIX<21EMA AND SHY/HYG<21EMA [+ internals]
  + confirmed variant: 'smooth' but require 2 consecutive on/off days (de-whipsaw)
Cash earns 0% (conservative). Run: python3 audit/regime-backtest.py
"""
import json, os, urllib.request, urllib.parse, math
from datetime import datetime
CACHE = "audit/.cachebt"; os.makedirs(CACHE, exist_ok=True)

def fetch(sym):
    safe = sym.replace("^", "_").replace(".", "-"); p = f"{CACHE}/{safe}.json"
    if os.path.exists(p): return json.load(open(p))
    p1 = int(datetime(2012, 1, 1).timestamp()); p2 = int(datetime.now().timestamp())
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?period1={p1}&period2={p2}&interval=1d"
    j = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=40))
    r = j["chart"]["result"][0]; q = r["indicators"]["quote"][0]
    b = {datetime.utcfromtimestamp(t).strftime("%Y-%m-%d"): {"h": q["high"][i], "l": q["low"][i], "c": q["close"][i]}
         for i, t in enumerate(r["timestamp"]) if q["close"][i] is not None}
    json.dump(b, open(p, "w")); return b
def ema(vals, n):
    k = 2/(n+1); out = [None]*len(vals); s = None
    for i, v in enumerate(vals):
        if i < n-1: continue
        s = sum(vals[i-n+1:i+1])/n if s is None else v*k + s*(1-k); out[i] = s
    return out

qqqe = fetch("QQQE"); vix = fetch("^VIX"); hyg = fetch("HYG"); shy = fetch("SHY"); qqq = fetch("QQQ"); spy = fetch("SPY")
qd = sorted(qqqe); eh = ema([qqqe[d]["h"] for d in qd], 21); ec = ema([qqqe[d]["c"] for d in qd], 21); el = ema([qqqe[d]["l"] for d in qd], 21)
above_cloud = {qd[i]: qqqe[qd[i]]["c"] > max(eh[i], ec[i], el[i]) for i in range(len(qd)) if ec[i] is not None}
above_smooth = {qd[i]: qqqe[qd[i]]["c"] > ec[i] for i in range(len(qd)) if ec[i] is not None}
vd = sorted(vix); ve = ema([vix[d]["c"] for d in vd], 21); vix_on = {vd[i]: vix[vd[i]]["c"] < ve[i] for i in range(len(vd)) if ve[i] is not None}
cd = sorted(set(hyg) & set(shy)); rat = [shy[d]["c"]/hyg[d]["c"] for d in cd]; re_ = ema(rat, 21)
credit_on = {cd[i]: rat[i] < re_[i] for i in range(len(cd)) if re_[i] is not None}
def prior(d, m): ks = [x for x in m if x <= d]; return m[ks[-1]] if ks else None

def sig_smooth(d): return bool(prior(d, above_smooth))
def sig_cloud(d): return bool(prior(d, above_cloud))
def sig_full(d):
    a = prior(d, above_smooth); v = prior(d, vix_on); c = prior(d, credit_on)
    return bool(a) and (v is None or v) and (c is None or c)

def backtest(inst, signal, confirm=1):
    ds = [d for d in sorted(inst) if d >= "2012-04-01"]
    bh = st = 1.0; pos = 0; pend = 0; cnt = 0; switches = 0; days_in = 0
    bh_c = []; st_c = []
    for i in range(1, len(ds)):
        d0, d1 = ds[i-1], ds[i]; r = inst[d1]["c"]/inst[d0]["c"] - 1
        bh *= (1+r); bh_c.append(bh)
        raw = 1 if signal(d0) else 0
        if raw == pend: cnt += 1
        else: pend = raw; cnt = 1
        if cnt >= confirm and raw != pos: pos = raw; switches += 1
        days_in += pos; st *= (1 + (r if pos else 0.0)); st_c.append(st)
    return bh_c, st_c, days_in/(len(ds)-1), switches, len(ds)/252

def m(curve):
    n = len(curve); cagr = curve[-1]**(252/n)-1
    peak = mdd = 0
    for v in curve:
        peak = max(peak, v); mdd = max(mdd, (peak-v)/peak)
    rets = [curve[j]/curve[j-1]-1 for j in range(1, len(curve))]
    mu = sum(rets)/len(rets); vol = math.sqrt(sum((x-mu)**2 for x in rets)/len(rets)*252)
    return cagr, mdd, vol, (cagr/vol if vol else 0), curve[-1]-1

def report(name, inst):
    print(f"\n### {name}")
    print(f"  {'strategy':34} {'totRet':>7} {'CAGR':>6} {'maxDD':>6} {'vol':>5} {'Sharpe':>7} {'%in':>5} {'sw':>4} {'sw/yr':>6}")
    rows = [("Buy & hold", lambda d: True, 1),
            ("Trend smooth (QQQE>21EMA)", sig_smooth, 1),
            ("Trend smooth + 2-day confirm", sig_smooth, 2),
            ("Cloud strict (his 'above struct')", sig_cloud, 1),
            ("Full 3-pillar + 2-day confirm", sig_full, 2)]
    for label, sig, conf in rows:
        bh_c, st_c, frac, sw, yrs = backtest(inst, sig, conf)
        curve = bh_c if label == "Buy & hold" else st_c
        cagr, mdd, vol, sh, tot = m(curve)
        print(f"  {label:34} {tot*100:>6.0f}% {cagr*100:>5.1f}% {mdd*100:>5.0f}% {vol*100:>4.0f}% {sh:>7.2f} {frac*100:>4.0f}% {sw:>4} {sw/yrs:>6.1f}")

report("QQQ  (Nasdaq-100, ~14y)", qqq)
report("SPY  (S&P 500, ~14y)", spy)
print("\nNote: USD underlying for clean data; timed-vs-B&H edge transfers to GBP EQQQ.L/VUSA.L (currency hits both arms equally). Cash=0%.")
