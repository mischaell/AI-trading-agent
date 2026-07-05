#!/usr/bin/env python3
"""one_book.py — THE BOOK, live paper version (replaces campaign_book, 2026-07-05).

Rules (frozen; backtested as A18/E0 in tradeoff_sweep.py):
  qualify   2 Alex calls within 90 days, OR one call if the ticker was a core
            name within the last 18 months (A18)
  entry     $5,000 at the qualifying day's CLOSE (2x dial) (bars, not posted prices)
  adds      +$5,000 when close is 3*ATR, then 6*ATR above basis (entry-day ATR)
  trail     3*ATR(14) below highest close; tightens to 2*ATR beyond +6 ATR of
            gain, 1.5*ATR beyond +12; halves while market state is below
            CONFIRMED/EARLY; exit ALL on a single close below the trail
  re-entry  after an exit the ticker needs a fresh qualifying call
  no trims  no partial exits of any kind
  guards    split/rebase freeze: >40% overnight close jump freezes the
            position for manual review instead of auto-selling
  sleeve    $100,000 paper, ~6-7 names max at full build ($15,000/name)

State: ~/mission-control/alex-forward-test/one_book.json
Alerts to stdout: BUY / ADD / SELL. EOD cadence (entries are at-close prices;
live execution is next open — slippage vs paper is expected and tracked by
comparing to the recorded close).
Usage: one_book.py --run   (process new calls + advance daily bars)
       one_book.py --backfill  (seed last-core dates from calls_live.json)
"""
import json, os, sys
from datetime import datetime

STATE_DIR = os.path.expanduser("~/mission-control/alex-forward-test")
STATE = os.path.join(STATE_DIR, "one_book.json")
CALLS = os.path.join(STATE_DIR, "calls_live.json")
REGIME = os.path.join(STATE_DIR, "regime_states.json")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engine

SLICE = 5000                                  # dial 2x (Michael, 2026-07-05); was 2500
CORE_WINDOW, RETURN_WINDOW = 90, 540          # days: 2-in-90d, A18 = 18 months

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

def open_pos(st, tkr):
    return next((p for p in st["positions"] if p["ticker"] == tkr and p["status"] in ("open", "frozen")), None)

def qualifies(st, tkr, date):
    calls = json.load(open(CALLS)) if os.path.exists(CALLS) else []
    prior = [c[0] for c in calls if c[1] == tkr and c[0] < date and days(c[0], date) <= CORE_WINDOW]
    if prior: return "2-in-90d"
    lc = st["last_core"].get(tkr)
    if lc and days(lc, date) <= RETURN_WINDOW: return "A18 returning leader"
    return None

def backfill(st):
    """Seed last_core from full call history so A18 works from day one."""
    calls = sorted(json.load(open(CALLS)), key=lambda c: c[0]) if os.path.exists(CALLS) else []
    bytkr = {}
    for c in calls: bytkr.setdefault(c[1], []).append(c[0])
    for tkr, ds in bytkr.items():
        lc = None
        for i, d in enumerate(ds):
            two = any(0 < days(x, d) <= CORE_WINDOW for x in ds[:i])
            ret = lc and days(lc, d) <= RETURN_WINDOW
            if two or ret: lc = d
        if lc: st["last_core"][tkr] = lc
    print(f"one_book backfill: {len(st['last_core'])} tickers with core history")

def process_candidates(st, cands):
    alerts = []
    for c in cands:
        key = f"{c['ticker']}:{c['date']}"
        if key in st["seen"]: continue
        st["seen"].append(key)
        tkr, d = c["ticker"], c["date"]
        if open_pos(st, tkr):
            print(f"one_book: {key} noted (position already open; adds are price-driven)")
            continue
        why = qualifies(st, tkr, d)
        if not why:
            print(f"one_book: {key} not qualified (1st call in 90d, not core within 18mo)")
            continue
        bars = engine.load(tkr)
        if not bars: continue
        i0 = next((i for i, b in enumerate(bars) if b["date"] >= d), None)
        if i0 is None or i0 < 20: continue
        a0 = engine.atr(bars, 14, i0)
        px = bars[i0]["close"]
        if not a0 or not px: continue
        st["last_core"][tkr] = d
        sh = SLICE / px
        st["positions"].append(dict(
            ticker=tkr, status="open", opened=bars[i0]["date"], basis=px, atr0=a0,
            lots=[[sh, px]], peak=px, adds=0, last_date=bars[i0]["date"]))
        trail = px - 3 * a0
        alerts.append(f"BUY {tkr} | {sh:.1f} sh @ {px:,.2f} close = ${SLICE:,} | {why} "
                      f"| trail 3xATR (now {trail:,.2f}) | adds at {px + 3*a0:,.2f} / {px + 6*a0:,.2f}")
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
            while p["adds"] < 2 and gain >= 3 * (p["adds"] + 1):
                sh = SLICE / c
                p["lots"].append([sh, c]); p["adds"] += 1
                tot = sum(s for s, _ in p["lots"]) * c
                alerts.append(f"ADD {tkr} | {sh:.1f} sh @ {c:,.2f} close = ${SLICE:,} "
                              f"(+{3*p['adds']} ATR above basis) | position ~${tot:,.0f}")
            w = 3.0
            if gain > 12: w = 1.5
            elif gain > 6: w = 2.0
            if not risk_on(b["date"]): w /= 2
            trail = p["peak"] - w * a
            if c < trail:
                cost = sum(s * px for s, px in p["lots"])
                pnl = sum(s for s, _ in p["lots"]) * c - cost
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
    print(f"one_book: {len(openp)} open, {st['closed']} closed ({st['wins']} wins), "
          f"realized ${st['realized']:+,.0f}")
    save(st)
    for a in alerts: print(a)

if __name__ == "__main__":
    main()
