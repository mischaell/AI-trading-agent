#!/usr/bin/env python3
"""refresh_data.py — daily data refresh for the alex-forward-test watcher.

Fixes the silent-staleness failure (barcache frozen at deploy date -> every
candidate dropped as non-compliant). Runs AFTER discord_pull, BEFORE
forward_test in run-forward-test.sh. Stdlib only.

1) Refetch Yahoo daily bars into SG_CACHE_DIR for: QQQ, QQQE, today's
   candidate tickers, open-position tickers, and any ticker with an entry
   call in the last 45 days (winner-continuation needs their history fresh).
2) Refresh the N100 breadth cache (.breadthcache) and recompute the daily
   5-state series -> regime_states.json (1:1 port of market-analysis.ts:
   MCO = EMA19(netAdv)-EMA39(netAdv), MCSI cumulative, z-scored 252d,
   QQQE 21EMA cloud position/slope).
"""
import json, os, time, urllib.parse, urllib.request
from datetime import datetime, timedelta

STATE_DIR = os.path.expanduser("~/mission-control/alex-forward-test")
BARS = os.environ.get("SG_CACHE_DIR", os.path.join(STATE_DIR, ".barcache"))
BREADTH = os.path.join(STATE_DIR, ".breadthcache")
REGIME_OUT = os.path.join(STATE_DIR, "regime_states.json")
CALLS_LIVE = os.path.join(STATE_DIR, "calls_live.json")

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

INTERNALS = ["HYG", "SHY", "XLK", "XLP", "^VIX"]   # credit / vol / defensive-rotation pillar

def fetch(sym, start="2024-08-01"):
    p1 = int(datetime.strptime(start, "%Y-%m-%d").timestamp())
    p2 = int(time.time())
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}"
           f"?period1={p1}&period2={p2}&interval=1d")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    j = json.load(urllib.request.urlopen(req, timeout=30))
    r = j["chart"]["result"][0]; q = r["indicators"]["quote"][0]
    return [{"date": datetime.utcfromtimestamp(t).strftime("%Y-%m-%d"),
             "high": q["high"][i], "low": q["low"][i], "close": q["close"][i],
             "vol": q["volume"][i]}
            for i, t in enumerate(r["timestamp"]) if q["close"][i] is not None]

def stale(path, days=1):
    if not os.path.exists(path): return True
    try:
        b = json.load(open(path))
        return not b or b[-1]["date"] < (datetime.now() - timedelta(days=days + 1)).strftime("%Y-%m-%d")
    except (ValueError, KeyError, OSError):
        return True

def refresh_bars():
    os.makedirs(BARS, exist_ok=True)
    want = {"QQQ", "QQQE"} | set(INTERNALS)
    cand = os.path.join(STATE_DIR, "candidates.json")
    if os.path.exists(cand):
        want |= {c["ticker"] for c in json.load(open(cand))}
    st = os.path.join(STATE_DIR, "state.json")
    if os.path.exists(st):
        want |= {p["ticker"] for p in json.load(open(st)).get("positions", [])
                 if p.get("status") == "open"}
    if os.path.exists(CALLS_LIVE):
        cut = (datetime.now() - timedelta(days=45)).strftime("%Y-%m-%d")
        want |= {c[1] for c in json.load(open(CALLS_LIVE)) if c[0] >= cut}
    ok = fail = skipped = 0
    for t in sorted(want):
        p = os.path.join(BARS, t + ".json")
        if not stale(p):
            skipped += 1; continue
        try:
            json.dump(fetch(t), open(p, "w")); ok += 1
        except Exception as e:
            fail += 1; print(f"refresh: {t} FAILED ({e})")
        time.sleep(0.25)
    print(f"refresh bars: {ok} fetched, {skipped} fresh, {fail} failed (of {len(want)})")
    if fail > len(want) // 3:
        raise SystemExit("refresh: too many bar failures — aborting so stale data is loud, not silent")

def ema(v, n):
    if not v: return []
    k = 2 / (n + 1); out = [v[0]]
    for x in v[1:]: out.append(x * k + out[-1] * (1 - k))
    return out

def zscore(vals, idx, window=252):
    s = vals[max(0, idx - window + 1): idx + 1]
    if len(s) < 20: return 0.0
    m = sum(s) / len(s)
    sd = (sum((x - m) ** 2 for x in s) / len(s)) ** 0.5
    return (vals[idx] - m) / sd if sd > 0 else 0.0

def refresh_regime():
    os.makedirs(BREADTH, exist_ok=True)
    closes = {}
    ok = fail = 0
    for t in N100 + ["QQQE"]:
        p = os.path.join(BREADTH, t + ".json")
        if stale(p):
            try:
                json.dump(fetch(t, start="2023-08-01"), open(p, "w"))
            except Exception:
                fail += 1
            time.sleep(0.25)
        try:
            b = json.load(open(p))
            if b: closes[t] = b; ok += 1
        except (OSError, ValueError):
            fail += 1
    qqqe = closes.pop("QQQE", None)
    if not qqqe or len(closes) < 80:
        print(f"regime: insufficient breadth data ({len(closes)} tickers) — keeping previous regime_states.json")
        return
    cmap = {t: {x["date"]: x["close"] for x in b} for t, b in closes.items()}
    dates = sorted(set().union(*[set(c) for c in cmap.values()]))
    net, used = [], []
    for i, d in enumerate(dates):
        if i == 0: continue
        prev = dates[i - 1]; adv = dec = 0
        for c in cmap.values():
            if d in c and prev in c:
                if c[d] > c[prev]: adv += 1
                elif c[d] < c[prev]: dec += 1
        if adv + dec < 50: continue
        net.append(adv - dec); used.append(d)
    e19, e39 = ema(net, 19), ema(net, 39)
    mco = [a - b for a, b in zip(e19, e39)]
    mcsi, cum = [], 0.0
    for x in mco: cum += x; mcsi.append(cum)
    mco_z = [zscore(mco, i) for i in range(len(mco))]
    mcsi_z = [zscore(mcsi, i) for i in range(len(mcsi))]
    bidx = {d: i for i, d in enumerate(used)}
    qc = [b["close"] for b in qqqe]
    eh = ema([b["high"] for b in qqqe], 21); ec = ema(qc, 21); el = ema([b["low"] for b in qqqe], 21)
    qidx = {b["date"]: i for i, b in enumerate(qqqe)}
    states = {}
    for d in used:
        i = bidx[d]; qi = qidx.get(d)
        if qi is None or qi < 22 or i < 1: continue
        close = qc[qi]
        pos = ("above_cloud" if close > max(eh[qi], ec[qi], el[qi])
               else "below_cloud" if close < min(eh[qi], ec[qi], el[qi]) else "inside_cloud")
        pct = (ec[qi] - ec[qi - 1]) / ec[qi - 1] * 100
        slope = "rising" if pct > 0.05 else ("falling" if pct < -0.05 else "flat")
        mz = mco_z[i]
        ms = "curling_up" if mcsi_z[i] >= mcsi_z[i - 1] else "curling_down"
        if pos == "above_cloud":
            st = "CONFIRMED_UPTREND" if (slope == "rising" or ms == "curling_up" or mz > 0) else "EARLY_CONFIRMATION"
        elif pos == "inside_cloud":
            if slope == "rising" or (slope == "flat" and (ms == "curling_up" or mz >= 0)):
                st = "EARLY_CONFIRMATION"
            else:
                st = "PARTICIPATION_FADE"
        else:
            if mz < -2: st = "WASHOUT"
            elif slope == "rising" or (ms == "curling_up" and mz > -1): st = "EARLY_CONFIRMATION"
            else: st = "BREAKDOWN"
        states[d] = st
    json.dump(states, open(REGIME_OUT, "w"))
    last = sorted(states)[-1]
    li = bidx[last]
    json.dump(dict(date=last, state=states[last], mco_z=round(mco_z[li], 2),
                   mcsi_z=round(mcsi_z[li], 2)),
              open(os.path.join(STATE_DIR, "regime_detail.json"), "w"))
    print(f"regime: {len(states)} daily states -> regime_states.json (latest {last}: {states[last]})")

if __name__ == "__main__":
    refresh_bars()
    refresh_regime()
