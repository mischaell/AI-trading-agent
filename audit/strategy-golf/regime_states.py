#!/usr/bin/env python3
"""regime_states.py — historical daily 5-state series (Nov-2024..Jun-2026).

1:1 port of src/tasks/market-analysis.ts determineMarketState() +
src/lib/market-data/calculate-breadth.ts (MCO = EMA19(netAdv) - EMA39(netAdv)
over the N100 universe, MCSI = cumulative MCO, both z-scored 252d) +
QQQE 21EMA cloud position/slope (0.05% slope threshold).

Bars fetched from 2023-08-01 (252d z-score warmup before Nov-24) into a
dedicated cache (.cachebreadth/). Emits regime_states.json {date: state}.
Causal by construction: every input at date d uses data <= d.
"""
import json, os, urllib.request
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cachebreadth")
os.makedirs(CACHE, exist_ok=True)
OUT = os.path.join(HERE, "regime_states.json")

N100 = ['AAPL','MSFT','NVDA','GOOGL','GOOG','AMZN','META','TSLA','AVGO','COST',
        'ADBE','AMD','NFLX','CSCO','INTC','QCOM','INTU','TXN','AMAT','MU',
        'LRCX','KLAC','SNPS','CDNS','MRVL','NXPI','ON','ADI','MCHP','ASML',
        'CRM','ADSK','PANW','CRWD','DDOG','ZS','FTNT','WDAY','TEAM','MDB',
        'SNOW','SPLK','ANSS','CSGP','CTSH','CDW','PAYC',
        'BKNG','ABNB','DASH','MELI','PYPL','TTD','TTWO','EA',
        'AMGN','GILD','REGN','VRTX','ISRG','IDXX','DXCM','ILMN','BIIB','MRNA',
        'GEHC','AZN','TMUS','CMCSA','CHTR','WBD',
        'PEP','KDP','MNST','KHC','MDLZ','SBUX','LULU','ROST','ORLY','CPRT',
        'DLTR','FAST','ODFL','PCAR','CSX','HON','CTAS','PAYX','VRSK','ROP',
        'MAR','ADP','AEP','XEL','EXC','CEG','FANG','BKR','CCEP','GFS','ARM',
        'SMCI','LIN','PDD','JD','BIDU']

def fetch(sym):
    p = os.path.join(CACHE, sym + ".json")
    if os.path.exists(p):
        return json.load(open(p))
    p1 = int(datetime(2023, 8, 1).timestamp()); p2 = int(datetime(2026, 7, 2).timestamp())
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}"
           f"?period1={p1}&period2={p2}&interval=1d")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        j = json.load(urllib.request.urlopen(req, timeout=30))
        r = j["chart"]["result"][0]; q = r["indicators"]["quote"][0]
        bars = [{"date": datetime.utcfromtimestamp(t).strftime("%Y-%m-%d"),
                 "high": q["high"][i], "low": q["low"][i], "close": q["close"][i]}
                for i, t in enumerate(r["timestamp"]) if q["close"][i] is not None]
    except Exception:
        bars = None
    json.dump(bars, open(p, "w"))
    return bars

def ema(v, n):
    if not v: return []
    k = 2 / (n + 1); out = [v[0]]
    for x in v[1:]: out.append(x * k + out[-1] * (1 - k))
    return out

def zscore(values, idx, window=252):
    start = max(0, idx - window + 1)
    s = values[start:idx + 1]
    if len(s) < 20: return 0.0
    m = sum(s) / len(s)
    var = sum((x - m) ** 2 for x in s) / len(s)
    sd = var ** 0.5
    return (values[idx] - m) / sd if sd > 0 else 0.0

def main():
    # --- breadth: daily advances/declines over the N100 ---
    closes = {}
    for i, t in enumerate(N100):
        b = fetch(t)
        if b: closes[t] = {x["date"]: x["close"] for x in b}
        if (i + 1) % 20 == 0: print(f"  bars {i+1}/{len(N100)}")
    dates = sorted(set().union(*[set(c) for c in closes.values()]))
    net_adv, used_dates = [], []
    for i, d in enumerate(dates):
        if i == 0: continue
        prev = dates[i - 1]; adv = dec = 0
        for t, c in closes.items():
            if d in c and prev in c:
                if c[d] > c[prev]: adv += 1
                elif c[d] < c[prev]: dec += 1
        if adv + dec < 50: continue          # holiday/thin day
        net_adv.append(adv - dec); used_dates.append(d)
    e19, e39 = ema(net_adv, 19), ema(net_adv, 39)
    mco = [a - b for a, b in zip(e19, e39)]
    mcsi, cum = [], 0.0
    for x in mco: cum += x; mcsi.append(cum)
    mco_z = [zscore(mco, i) for i in range(len(mco))]
    mcsi_z = [zscore(mcsi, i) for i in range(len(mcsi))]
    bidx = {d: i for i, d in enumerate(used_dates)}

    # --- QQQE 21EMA cloud ---
    qqqe = fetch("QQQE")
    qc = [b["close"] for b in qqqe]
    eh = ema([b["high"] for b in qqqe], 21)
    ec = ema(qc, 21)
    el = ema([b["low"] for b in qqqe], 21)
    qidx = {b["date"]: i for i, b in enumerate(qqqe)}

    # --- state machine (verbatim port of determineMarketState) ---
    states = {}
    for d in used_dates:
        i = bidx[d]; qi = qidx.get(d)
        if qi is None or qi < 22 or i < 1: continue
        close = qc[qi]
        hi, ci, lo = eh[qi], ec[qi], el[qi]
        pos = ("above_cloud" if close > max(hi, ci, lo)
               else "below_cloud" if close < min(hi, ci, lo) else "inside_cloud")
        pct = (ec[qi] - ec[qi - 1]) / ec[qi - 1] * 100
        slope = "rising" if pct > 0.05 else ("falling" if pct < -0.05 else "flat")
        mz, sz = mco_z[i], mcsi_z[i]
        mcsi_slope = "curling_up" if mcsi_z[i] >= mcsi_z[i - 1] else "curling_down"
        if pos == "above_cloud":
            if slope == "rising": st = "CONFIRMED_UPTREND"
            elif mcsi_slope == "curling_up" or mz > 0: st = "CONFIRMED_UPTREND"
            else: st = "EARLY_CONFIRMATION"
        elif pos == "inside_cloud":
            if slope == "rising": st = "EARLY_CONFIRMATION"
            elif slope == "flat" and mcsi_slope == "curling_up": st = "EARLY_CONFIRMATION"
            elif slope == "flat" and mz >= 0: st = "EARLY_CONFIRMATION"
            else: st = "PARTICIPATION_FADE"
        else:
            if mz < -2: st = "WASHOUT"
            elif slope == "rising": st = "EARLY_CONFIRMATION"
            elif mcsi_slope == "curling_up" and mz > -1: st = "EARLY_CONFIRMATION"
            else: st = "BREAKDOWN"
        states[d] = st

    json.dump(states, open(OUT, "w"))
    # sanity print: state shares per quarter
    from collections import Counter
    byq = {}
    for d, s in states.items():
        if d < "2024-11-01": continue
        q = f"{d[:4]}Q{(int(d[5:7])-1)//3+1}"
        byq.setdefault(q, Counter())[s] += 1
    for q in sorted(byq):
        tot = sum(byq[q].values())
        top = ", ".join(f"{s} {c*100//tot}%" for s, c in byq[q].most_common(3))
        print(f"{q}: {top}")
    print(f"\n{len(states)} daily states -> {OUT}")

if __name__ == "__main__":
    main()
