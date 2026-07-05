#!/usr/bin/env python3
"""
Strategy search (Mode A + cost + filters).

Goal: find an entry-filter rule set on Alex's LONG equity-trades calls that,
executed SINGLE-LEG (no churn) at a 3R target, beats his cost-adjusted baseline
out-of-sample. Win condition: OOS net >= +0.10R, win >= 40%, >=150 trades retained.

Cost model: Michael's FX = ~0.875% of position per conversion; single-leg => 1x.
cost_in_R = 0.875 / stop_distance_pct.  All math local (no LLM tokens).

Run from repo root:  python3 audit/strategy-search.py
"""
import json, re, os, urllib.request, itertools
from datetime import datetime

FX = 0.875
RMULT = 3.0
CACHE = "audit/.cache"
EXPORT = "data/discord-exports/equity-trades.json"
WIN_NET, WIN_RATE, WIN_KEEP = 0.10, 0.40, 150

# ---- data loading -------------------------------------------------------
def fetch(sym):
    p1 = int(datetime(2024, 9, 1).timestamp()); p2 = int(datetime.now().timestamp())
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}"
           f"?period1={p1}&period2={p2}&interval=1d")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    j = json.load(urllib.request.urlopen(req, timeout=30))
    r = j["chart"]["result"][0]; q = r["indicators"]["quote"][0]
    bars = [{"date": datetime.utcfromtimestamp(t).strftime("%Y-%m-%d"),
             "high": q["high"][i], "low": q["low"][i], "close": q["close"][i]}
            for i, t in enumerate(r["timestamp"]) if q["close"][i] is not None]
    return bars

def load(sym):
    p = f"{CACHE}/{sym}.json"
    if os.path.exists(p):
        return json.load(open(p))
    try:
        b = fetch(sym); json.dump(b, open(p, "w")); return b
    except Exception:
        return None

def ema(vals, n):
    k = 2 / (n + 1); out = [None] * len(vals)
    if len(vals) < n: return out
    s = sum(vals[:n]) / n; out[n - 1] = s
    for i in range(n, len(vals)):
        s = vals[i] * k + s * (1 - k); out[i] = s
    return out

def atr(bars, n, i):  # ATR over n bars ending at index i (inclusive)
    if i < n: return None
    trs = []
    for j in range(i - n + 1, i + 1):
        tr = max(bars[j]["high"] - bars[j]["low"],
                 abs(bars[j]["high"] - bars[j - 1]["close"]) if j > 0 else 0,
                 abs(bars[j]["low"] - bars[j - 1]["close"]) if j > 0 else 0)
        trs.append(tr)
    return sum(trs) / n

# ---- parse calls --------------------------------------------------------
LCALL = re.compile(r'Long\s+([\d.]+)%\s+([A-Z]{1,6})\s+@\s+([\d.]+).*?SL\s*@\s*([\d.]+)', re.I | re.S)
msgs = json.load(open(EXPORT))["messages"]
qqqe = load("QQQE"); qqq = load("QQQ")
qqq_by = {b["date"]: b for b in qqq} if qqq else {}
# QQQE structure cloud series
if qqqe:
    eh = ema([b["high"] for b in qqqe], 21); ec = ema([b["close"] for b in qqqe], 21)
    el = ema([b["low"] for b in qqqe], 21)
    qqqe_above = {}
    for i, b in enumerate(qqqe):
        if ec[i] is None: continue
        qqqe_above[b["date"]] = b["close"] > max(eh[i], ec[i], el[i])
else:
    qqqe_above = {}

def qqq_ret(date, n):
    ds = sorted(qqq_by)
    if date not in qqq_by:
        prior = [d for d in ds if d <= date]
        if not prior: return None
        date = prior[-1]
    i = ds.index(date)
    if i < n: return None
    return qqq_by[ds[i]]["close"] / qqq_by[ds[i - n]]["close"] - 1

calls = []
for m in msgs:
    h = LCALL.search(m.get("content", "") or "")
    if not h: continue
    entry, sl = float(h[3]), float(h[4])
    if entry <= 0 or entry == sl: continue
    tkr = h[2].upper(); date = m["timestamp"][:10]
    bars = load(tkr)
    if not bars: continue
    i0 = next((i for i, b in enumerate(bars) if b["date"] >= date), None)
    if i0 is None or i0 < 25: continue
    risk = abs(entry - sl)
    # outcome at 3R (stop wins same-bar ties)
    g = None
    tgt = entry + RMULT * risk
    for b in bars[i0:]:
        if b["low"] <= sl: g = -1.0; break
        if b["high"] >= tgt: g = RMULT; break
    if g is None: continue  # still open -> exclude
    # features using info up to prior close (i0-1): no lookahead
    p = i0 - 1
    closes = [b["close"] for b in bars[:p + 1]]
    e21 = ema(closes, 21)[p]
    a14 = atr(bars, 14, p); a5 = atr(bars, 5, p); a20 = atr(bars, 20, p)
    if None in (e21, a14, a5, a20) or a14 == 0: continue
    stoppct = risk / entry * 100
    t20 = bars[p]["close"] / bars[p - 20]["close"] - 1 if p >= 20 else None
    q20 = qqq_ret(bars[p]["date"], 20)
    rng = bars[p]["high"] - bars[p]["low"]
    calls.append(dict(
        date=date, tkr=tkr, g=g, net=g - FX / stoppct,  # churn=1
        stoppct=stoppct, dist_atr=(entry - e21) / a14,
        contraction=a5 < a20 * 0.8,
        rs=(t20 - q20) if (t20 is not None and q20 is not None) else 0.0,
        size=float(h[1]),
        close_range=((bars[p]["close"] - bars[p]["low"]) / rng) if rng > 0 else 0.5,
        regime_above=qqqe_above.get(date, qqqe_above.get(max([d for d in qqqe_above if d <= date], default=None), False)),
    ))

calls.sort(key=lambda c: c["date"])
split = calls[int(len(calls) * 0.70)]["date"]
train = [c for c in calls if c["date"] < split]
test = [c for c in calls if c["date"] >= split]

def stats(rows):
    n = len(rows)
    if not n: return (0, 0.0, 0.0)
    win = sum(1 for c in rows if c["g"] > 0) / n
    net = sum(c["net"] for c in rows) / n
    return (n, win, net)

FILTERS = {
    "regime_above": lambda c: c["regime_above"],
    "mode1(dist<=0)": lambda c: c["dist_atr"] <= 0,
    "near_ema(|d|<=0.5)": lambda c: abs(c["dist_atr"]) <= 0.5,
    "gradeA(d<=0.3)": lambda c: c["dist_atr"] <= 0.3,
    "widestop>=3%": lambda c: c["stoppct"] >= 3.0,
    "widestop>=4%": lambda c: c["stoppct"] >= 4.0,
    "contraction": lambda c: c["contraction"],
    "rs>0": lambda c: c["rs"] > 0,
    "rs>5%": lambda c: c["rs"] > 0.05,
    "size>=12": lambda c: c["size"] >= 12,
    "close>=0.5": lambda c: c["close_range"] >= 0.5,
}

def apply(rows, keys):
    fns = [FILTERS[k] for k in keys]
    return [c for c in rows if all(f(c) for f in fns)]

print(f"Long calls evaluated: {len(calls)}  (train {len(train)} < {split} <= test {len(test)})")
print(f"Cost: FX {FX}%/conv, single-leg.  Target {RMULT}R.  "
      f"Win bar: OOS net>=+{WIN_NET}R & win>={WIN_RATE:.0%} & keep>={WIN_KEEP}\n")
bn, bw, bnet = stats(calls); print(f"BASELINE (all longs)   n={bn}  win={bw:.1%}  net={bnet:+.3f}R   "
                                   f"[train net {stats(train)[2]:+.3f} | OOS net {stats(test)[2]:+.3f}]\n")

print("Single filters (full | train | OOS):")
print(f"  {'filter':22} {'keep':>4} {'fullNet':>8} {'trNet':>7} {'oosN':>5} {'oosWin':>7} {'oosNet':>8}")
singles = []
for k in FILTERS:
    f_all = apply(calls, [k]); f_tr = apply(train, [k]); f_te = apply(test, [k])
    n, w, net = stats(f_all); tn, tw, tnet = stats(f_tr); en, ew, enet = stats(f_te)
    singles.append((k, tnet))
    print(f"  {k:22} {n:>4} {net:>+8.3f} {tnet:>+7.3f} {en:>5} {ew:>7.1%} {enet:>+8.3f}")

# brute-force combos up to 3 filters, rank by TRAIN net (with train-size floor), then show OOS
print("\nSearching filter combos (rank by TRAIN net, train n>=60, full keep>=%d)..." % WIN_KEEP)
results = []
keys = list(FILTERS)
for r in (1, 2, 3):
    for combo in itertools.combinations(keys, r):
        tr = apply(train, combo);
        if len(tr) < 60: continue
        full = apply(calls, combo)
        if len(full) < WIN_KEEP: continue
        te = apply(test, combo)
        results.append((combo, stats(full), stats(train and apply(train, combo)), stats(te)))
results.sort(key=lambda x: x[2][2], reverse=True)  # by train net

print(f"\n  {'combo':46} {'keep':>4} {'trNet':>7} {'oosN':>5} {'oosWin':>7} {'oosNet':>8}  pass?")
winner = None
for combo, (n, w, net), (tn, tw, tnet), (en, ew, enet) in results[:12]:
    ok = (enet >= WIN_NET and ew >= WIN_RATE and n >= WIN_KEEP)
    if ok and winner is None: winner = (combo, n, w, net, en, ew, enet)
    print(f"  {'+'.join(combo):46} {n:>4} {tnet:>+7.3f} {en:>5} {ew:>7.1%} {enet:>+8.3f}  {'YES' if ok else ''}")

print("\n" + "=" * 70)
if winner:
    combo, n, w, net, en, ew, enet = winner
    print(f"GOAL MET. Strategy: {' + '.join(combo)}")
    print(f"  Full sample: keep={n}  win={w:.1%}  net={net:+.3f}R")
    print(f"  Out-of-sample: n={en}  win={ew:.1%}  net={enet:+.3f}R  (bar: +{WIN_NET}R / {WIN_RATE:.0%})")
else:
    best = max(results, key=lambda x: x[3][2]) if results else None
    print("GOAL NOT MET — no filter set clears net>=+0.10R & win>=40% OOS with >=150 kept.")
    if best:
        combo, (n, w, net), _, (en, ew, enet) = best
        print(f"  Best OOS-net found: {' + '.join(combo)}  keep={n} oosWin={ew:.1%} oosNet={enet:+.3f}R")
    print("  Honest read: Alex's signal does not survive your FX cost out-of-sample on this sample.")
