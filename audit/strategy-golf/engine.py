#!/usr/bin/env python3
"""Strategy Golf engine — the investing twin of Parameter Golf.

One fixed, verifiable backtest over Alex's FULL ~19-month long-call history
(equity-trades.json Nov-24..Jan-26  +  gap-equity-trades.jsonl Jan-26..Jun-26).
A `strategy` dict (filters + exit model + cost) is the single artifact the loop
edits; simulate() returns the per-trade ledger. All compute is local (Yahoo bars
cached on disk) so a self-correction loop can iterate at ~0 LLM tokens/iteration.

This file is the substrate; it makes NO judgement. backtest.py scores it and an
independent verifier sub-agent grades the result. Reuses the proven indicator /
regime logic from audit/runner-exits.py + audit/medium-leaders.py verbatim.
"""
import json, re, os, urllib.request
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # repo root
CACHES = [os.path.join(ROOT, "audit", d) for d in (".cache2", ".cache", ".cachebt")]
# SG_CACHE_DIR lets the Mini cron job read+write bars OFF Dropbox (avoids CloudStorage
# EPERM under memory pressure). When set, it's the write target and first read source.
_ext = os.environ.get("SG_CACHE_DIR")
if _ext:
    CACHES = [_ext] + CACHES
    WRITE_CACHE = _ext
else:
    WRITE_CACHE = CACHES[0]
os.makedirs(WRITE_CACHE, exist_ok=True)
LCALL = re.compile(r'Long\s+([\d.]+)%\s+([A-Z]{1,6})\s+@\s+([\d.]+).*?SL\s*@\s*([\d.]+)', re.I | re.S)

# ---- price data (multi-cache read, single-cache write) --------------------
def _fetch(sym):
    p1 = int(datetime(2024, 8, 1).timestamp()); p2 = int(datetime.now().timestamp())
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}"
           f"?period1={p1}&period2={p2}&interval=1d")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    j = json.load(urllib.request.urlopen(req, timeout=30))
    r = j["chart"]["result"][0]; q = r["indicators"]["quote"][0]
    return [{"date": datetime.utcfromtimestamp(t).strftime("%Y-%m-%d"),
             "high": q["high"][i], "low": q["low"][i], "close": q["close"][i], "vol": q["volume"][i]}
            for i, t in enumerate(r["timestamp"]) if q["close"][i] is not None]

_barcache = {}
def load(sym):
    if sym in _barcache: return _barcache[sym]
    for c in CACHES:
        p = f"{c}/{sym}.json"
        try:
            if os.path.exists(p):
                b = json.load(open(p)); _barcache[sym] = b; return b
        except OSError:
            continue  # denied/EPERM Dropbox read -> fall through to fetch
    try:
        b = _fetch(sym); json.dump(b, open(f"{WRITE_CACHE}/{sym}.json", "w"))
    except Exception:
        b = None
    _barcache[sym] = b; return b

def ema(v, n):
    k = 2/(n+1); out = [None]*len(v)
    if len(v) < n: return out
    s = sum(v[:n])/n; out[n-1] = s
    for i in range(n, len(v)): s = v[i]*k + s*(1-k); out[i] = s
    return out

def atr(bars, n, i):
    if i < n: return None
    return sum(max(bars[j]["high"]-bars[j]["low"], abs(bars[j]["high"]-bars[j-1]["close"]),
                   abs(bars[j]["low"]-bars[j-1]["close"])) for j in range(i-n+1, i+1)) / n

# ---- market regime (QQQ trend + QQQE 21EMA cloud) -------------------------
_qqq = load("QQQ"); _qqqe = load("QQQE")
_qc = [b["close"] for b in _qqq]; _qsma = ema(_qc, 50)
_qix = {b["date"]: i for i, b in enumerate(_qqq)}
_eh = ema([b["high"] for b in _qqqe], 21); _ec = ema([b["close"] for b in _qqqe], 21); _el = ema([b["low"] for b in _qqqe], 21)
_qa = {b["date"]: (b["close"] > max(_eh[i], _ec[i], _el[i])) for i, b in enumerate(_qqqe) if _ec[i] is not None}

def _near(d, ix):
    return d if d in ix else max([x for x in ix if x <= d], default=None)

def qpos(d):
    dd = _near(d, _qix); i = _qix[dd] if dd else None
    return (_qc[i] > _qsma[i]) if (i is not None and _qsma[i]) else None

def qret(d, n):
    dd = _near(d, _qix); i = _qix[dd] if dd else None
    return _qc[i]/_qc[i-n]-1 if (i is not None and i >= n) else None

def strong_regime(d):
    dd = _near(d, _qa)
    return bool(_qa.get(dd)) and bool(qpos(d))

# ---- unified signal load (full history, deduped) --------------------------
def load_calls():
    """Return [(date, ticker, entry, sl), ...] long calls across the full history."""
    seen = set(); out = []
    def add(date, tkr, e, sl):
        key = (date, tkr.upper())
        if key in seen or e <= 0 or e == sl: return
        seen.add(key); out.append((date, tkr.upper(), float(e), float(sl)))
    # full back-history export
    exp = os.path.join(ROOT, "data", "discord-exports", "equity-trades.json")
    for m in json.load(open(exp))["messages"]:
        h = LCALL.search(m.get("content", "") or "")
        if h: add(m.get("timestamp", "")[:10], h[2], float(h[3]), float(h[4]))
    # live gap
    gap = os.path.join(ROOT, "audit", "gap-equity-trades.jsonl")
    for line in open(gap):
        m = json.loads(line); h = LCALL.search(m.get("content", "") or "")
        if h: add(m["timestamp"][:10], h[2], float(h[3]), float(h[4]))
    out.sort(key=lambda r: r[0])
    return out

# ---- the configurable strategy ---------------------------------------------
def passes_filter(strat, bars, p, date, e, e21, a14):
    """Apply entry filters per strategy spec. p = index of bar before entry."""
    t20 = bars[p]["close"]/bars[p-20]["close"]-1 if p >= 20 else None
    q20 = qret(bars[p]["date"], 20)
    rs = (t20 - q20) if (t20 is not None and q20 is not None) else -9
    dvol = sorted(b["close"]*(b["vol"] or 0) for b in bars[p-19:p+1])[10] if p >= 19 else 0
    dist = (e - e21) / a14  # entry distance to 21EMA in ATRs
    if strat.get("filter") == "medium":
        if not (dvol >= 100e6 and rs > 0 and -0.5 <= dist <= 0.5 and strong_regime(date)):
            return None, rs
    if strat.get("regime_gate") and not strong_regime(date):
        return None, rs
    if strat.get("rs_floor") is not None and rs < strat["rs_floor"]:
        return None, rs
    if strat.get("rs_ceiling") is not None and rs > strat["rs_ceiling"]:
        return None, rs
    return True, rs

def simulate(strat):
    """Run the strategy over full history -> list of trade dicts (R is GROSS)."""
    trades = []
    for date, tkr, e, sl in load_calls():
        bars = load(tkr)
        if not bars: continue
        i0 = next((i for i, b in enumerate(bars) if b["date"] >= date), None)
        if i0 is None or i0 < 25: continue
        p = i0 - 1
        e21s = ema([b["close"] for b in bars[:p+1]], 21); e21 = e21s[p]
        a14 = atr(bars, 14, p)
        if e21 is None or a14 in (None, 0): continue
        ok, rs = passes_filter(strat, bars, p, date, e, e21, a14)
        if not ok: continue
        risk = e - sl
        if risk <= 0: continue
        stop_pct = risk / e
        R = None; mfe = 0.0
        if strat.get("exit_model") == "runner":
            elow = ema([b["low"] for b in bars], 21); stop = sl
            for j in range(i0, len(bars)):
                b = bars[j]; mfe = max(mfe, (b["high"]-e)/risk)
                if elow[j] is not None: stop = max(stop, elow[j])
                if b["close"] < stop:
                    R = (b["close"] - e)/risk; break
            # still open -> mark-to-last-close, flagged
            open_trade = R is None
            if open_trade: R = (bars[-1]["close"] - e)/risk
        else:
            tgt = e + strat.get("target_R", 3)*risk; open_trade = False
            for b in bars[i0:]:
                mfe = max(mfe, (b["high"]-e)/risk)
                if b["low"] <= sl: R = -1.0; break
                if b["high"] >= tgt: R = float(strat.get("target_R", 3)); break
            if R is None: R = (bars[-1]["close"] - e)/risk; open_trade = True
        # FX cost in R (single-leg round trip): cost% of position / stop%
        fx = strat.get("fx_roundtrip_pct", 0.0)/100.0
        cost_R = (fx / stop_pct) if stop_pct else 0.0
        trades.append(dict(date=date, tkr=tkr, R=round(R, 3), R_net=round(R - cost_R, 3),
                           mfe=round(mfe, 2), stop_pct=round(stop_pct, 4),
                           rs=round(rs, 4), open=open_trade, q=quarter(date)))
    return trades

def quarter(d):
    y, m = int(d[:4]), int(d[5:7]); return f"{y}Q{(m-1)//3+1}"

if __name__ == "__main__":
    print(f"full-history long calls: {len(load_calls())}")
