#!/usr/bin/env python3
"""one_book.py — THE BOOK, live paper version (v2 design, 2026-07-06).

Parameter provenance: M = Michael's explicit words, T = tested choice he
approved, C = my convention flagged to him.

  qualify   2 Alex calls in 90d, or 1 call if core within 18mo (A18)      [T]
  probe     $2,500 at qualifying day's close                              [M]
            $5,000 if winner-continuation: his last stated Closed in the
            ticker within 30 days was a profit                            [T]
  adds      triggered by HIS next call in the name while our position is
            in profit (close > basis); catch-up sizing to targets
            $11,000 -> $19,000 -> $28,000 (his avg first position / his
            p75 single / his median full build)                           [M/T]
            his call while we are losing: ignored                         [M]
  trail     3*ATR(14) below highest close; 2*ATR beyond +6 ATR gain,
            1.5*ATR beyond +12 [C stages]; halved while market state below
            CONFIRMED/EARLY; single close exits all                       [T]
  no trims  exits only via trail                                          [M]
  guards    >40% overnight close jump freezes position (split suspicion)  [T]
  sleeve    $100,000: when deployed cost >= $100k, only winner-continuation
            probes may open; all other new entries are skipped (logged).
            Adds (catch-ups on his calls) remain allowed when full [C —
            "entries" ruled by Michael 2026-07-06; adds unruled, flagged]  [M/C]

Supersedes the 2026-07-05 v1 (price-ladder adds, 2x dial).
State: one_book.json. Alerts: BUY / ADD / SELL. EOD cadence.
Usage: --run | --backfill
"""
import json, os, sys
from datetime import datetime

STATE_DIR = os.path.expanduser("~/mission-control/alex-forward-test")
STATE = os.path.join(STATE_DIR, "one_book.json")
CALLS = os.path.join(STATE_DIR, "calls_live.json")
REGIME = os.path.join(STATE_DIR, "regime_states.json")
EXITS = [os.path.join(STATE_DIR, "exits_seed.jsonl"),
         os.path.join(STATE_DIR, "exits_live.jsonl")]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engine

PROBE, PROBE_WC = 2500, 5000
TARGETS = [11000, 19000, 28000]
CORE_WINDOW, RETURN_WINDOW, WC_WINDOW = 90, 540, 30

def days(a, b): return (datetime.strptime(b, "%Y-%m-%d") - datetime.strptime(a, "%Y-%m-%d")).days

def load():
    if os.path.exists(STATE): return json.load(open(STATE))
    return dict(positions=[], last_core={}, seen=[], realized=0.0, closed=0, wins=0)

def save(st): json.dump(st, open(STATE, "w"), indent=2)

def risk_on(d):
    if not os.path.exists(REGIME): return True
    states = json.load(open(REGIME))
    p = [x for x in sorted(states) if x < d]
    return bool(p) and states[p[-1]] in ("CONFIRMED_UPTREND", "EARLY_CONFIRMATION")

def winner_continuation(tkr, date):
    """His most recent stated Closed for this ticker within 30d was a profit."""
    best = None
    for path in EXITS:
        if not os.path.exists(path): continue
        for l in open(path):
            try: r = json.loads(l)
            except ValueError: continue
            if (r.get("action") == "Closed" and r.get("ticker") == tkr
                    and r.get("pnl_pct") is not None and r["msg_date"] < date
                    and days(r["msg_date"], date) <= WC_WINDOW):
                if best is None or r["msg_date"] > best[0]:
                    best = (r["msg_date"], r["pnl_pct"])
    return bool(best) and best[1] > 0

def open_pos(st, tkr):
    return next((p for p in st["positions"] if p["ticker"] == tkr and p["status"] in ("open", "frozen")), None)

def qualifies(st, tkr, date):
    calls = json.load(open(CALLS)) if os.path.exists(CALLS) else []
    if [c for c in calls if c[1] == tkr and c[0] < date and days(c[0], date) <= CORE_WINDOW]:
        return "2-in-90d"
    lc = st["last_core"].get(tkr)
    if lc and days(lc, date) <= RETURN_WINDOW: return "A18 returning leader"
    return None

def backfill(st):
    calls = sorted(json.load(open(CALLS)), key=lambda c: c[0]) if os.path.exists(CALLS) else []
    bytkr = {}
    for c in calls: bytkr.setdefault(c[1], []).append(c[0])
    for tkr, ds in bytkr.items():
        lc = None
        for i, d in enumerate(ds):
            if any(0 < days(x, d) <= CORE_WINDOW for x in ds[:i]) or (lc and days(lc, d) <= RETURN_WINDOW):
                lc = d
        if lc: st["last_core"][tkr] = lc
    print(f"one_book backfill: {len(st['last_core'])} tickers with core history")

def value(p, px): return sum(s for s, _ in p["lots"]) * px

def process_candidates(st, cands):
    alerts = []
    for c in cands:
        key = f"{c['ticker']}:{c['date']}"
        if key in st["seen"]: continue
        st["seen"].append(key)
        tkr, d = c["ticker"], c["date"]
        bars = engine.load(tkr)
        if not bars: continue
        i0 = next((i for i, b in enumerate(bars) if b["date"] >= d), None)
        if i0 is None or i0 < 20: continue
        px = bars[i0]["close"]
        pos = open_pos(st, tkr)
        if pos and pos["status"] == "open":
            if px <= pos["basis"]:
                print(f"one_book: {key} ignored (his add, position not in profit: "
                      f"{px:,.2f} <= basis {pos['basis']:,.2f})")
                continue
            if pos["stage"] >= len(TARGETS):
                print(f"one_book: {key} ignored (fully built at ${TARGETS[-1]:,})")
                continue
            tgt = TARGETS[pos["stage"]]
            val = value(pos, px)
            if val < tgt:
                add = tgt - val
                sh = add / px
                pos["lots"].append([sh, px])
                alerts.append(f"ADD {tkr} | {sh:.1f} sh @ {px:,.2f} close = ${add:,.0f} "
                              f"(his add, catch-up to ${tgt:,}) | position ~${value(pos, px):,.0f}")
            pos["stage"] += 1
            continue
        why = qualifies(st, tkr, d)
        if not why:
            print(f"one_book: {key} not qualified (1st call in 90d, not core within 18mo)")
            continue
        a0 = engine.atr(bars, 14, i0)
        if not a0 or not px: continue
        wc = winner_continuation(tkr, d)
        deployed = sum(sum(s * lp for s, lp in p["lots"])
                       for p in st["positions"] if p["status"] == "open")
        if deployed >= 100_000 and not wc:
            print(f"one_book: {key} skipped (sleeve full at ${deployed:,.0f}; "
                  f"only winner-continuation entries allowed)")
            continue
        st["last_core"][tkr] = d
        size = PROBE_WC if wc else PROBE
        sh = size / px
        st["positions"].append(dict(
            ticker=tkr, status="open", opened=bars[i0]["date"], basis=px, atr0=a0,
            lots=[[sh, px]], peak=px, stage=0, last_date=bars[i0]["date"]))
        tag = " | winner-continuation, $5k probe" if wc else ""
        alerts.append(f"BUY {tkr} | {sh:.1f} sh @ {px:,.2f} close = ${size:,} | {why}{tag} "
                      f"| trail 3xATR (now {px - 3*a0:,.2f})")
    return alerts

def advance(st):
    alerts = []
    for p in st["positions"]:
        if p["status"] != "open": continue
        tkr = p["ticker"]
        bars = engine.load(tkr)
        if not bars: continue
        start = next((i for i, b in enumerate(bars) if b["date"] > p["last_date"]), len(bars))
        for j in range(start, len(bars)):
            b = bars[j]; c = b["close"]
            if j > 0 and bars[j-1]["close"] and abs(c / bars[j-1]["close"] - 1) > 0.40:
                p["status"] = "frozen"
                alerts.append(f"SELL {tkr} | FROZEN — close jumped {bars[j-1]['close']:,.2f} -> {c:,.2f} "
                              f"(possible split); manual check, no auto-sell")
                break
            p["last_date"] = b["date"]
            a = engine.atr(bars, 14, j) or p["atr0"]
            p["peak"] = max(p["peak"], c)
            gain = (c - p["basis"]) / p["atr0"]
            w = 3.0
            if gain > 12: w = 1.5
            elif gain > 6: w = 2.0
            if not risk_on(b["date"]): w /= 2
            trail = p["peak"] - w * a
            if c < trail:
                cost = sum(s * px for s, px in p["lots"])
                pnl = value(p, c) - cost
                p["status"] = "closed"; p["closed"] = b["date"]; p["pnl"] = round(pnl, 2)
                st["realized"] += pnl; st["closed"] += 1; st["wins"] += 1 if pnl > 0 else 0
                alerts.append(f"SELL {tkr} | all {sum(s for s,_ in p['lots']):.1f} sh @ {c:,.2f} "
                              f"(close below trail {trail:,.2f}) | {pnl:+,.0f} USD ({pnl/cost*100:+.1f}%)")
                break
    return alerts

def main():
    st = load()
    if "--backfill" in sys.argv:
        backfill(st); save(st); return
    alerts = []
    for f in ("candidates_today.json", "candidates.json"):
        path = os.path.join(STATE_DIR, f)
        if os.path.exists(path):
            alerts += process_candidates(st, json.load(open(path)))
    alerts += advance(st)
    openp = [p for p in st["positions"] if p["status"] == "open"]
    deployed = sum(sum(s * px for s, px in p["lots"]) for p in openp)
    print(f"one_book: {len(openp)} open (${deployed:,.0f} deployed at cost), "
          f"{st['closed']} closed ({st['wins']} wins), realized ${st['realized']:+,.0f}")
    save(st)
    for a in alerts: print(a)

if __name__ == "__main__":
    main()
