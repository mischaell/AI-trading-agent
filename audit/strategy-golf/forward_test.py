#!/usr/bin/env python3
"""Alex forward-test CORE (paper). Pure logic, no discord/telegram coupling:
the Mini harness pulls his new equity-trades posts and pipes them in; this module
filters them through the VALIDATED strategy, opens paper positions, tracks the
2R/5R/runner scale-out day by day, and maintains a live scorecard vs the backtest.

Validated strategy (see project_strategy_golf_fable_test memory):
  trigger  = Alex posts a Long call (his curation = the alpha)
  filter   = liquid leader ($vol>=100m) + RS band [0.05,0.20] + clean pullback
             (entry within +/-0.5 ATR of a RISING 21EMA) + STRONG regime
  entry    = close of the qualifying day ; SSL = 21EMA-low (his R unit)
  exit     = trim 1/3 @2R, 1/3 @5R, run last 1/3 trailing the 21EMA-low
  cost     = USD account 0.10%
Backtest reference (his watchlist, 19mo): FULL +0.49R [+0.23,+0.76]; OOS +0.24R.

State (paper ledger) lives OFF Dropbox: ~/mission-control/alex-forward-test/state.json
Usage:
  python3 forward_test.py --dry-run                 # replay history, validate the tracker
  python3 forward_test.py --candidates calls.json   # live: ingest new posts, advance, alert
calls.json = [{"ticker":"NVDA","date":"2026-06-10","entry":174.2,"sl":168.0}, ...]
Prints alert text to stdout (the harness forwards it to Telegram)."""
import sys, os, json, argparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engine

RS_LO, RS_HI = 0.05, 0.20
FX = 0.10/100
STATE_DIR = os.path.expanduser("~/mission-control/alex-forward-test")
STATE = os.path.join(STATE_DIR, "state.json")
BT_FULL, BT_OOS = 0.49, 0.24

def _rising(e, i, k=5): return i >= k and e[i] is not None and e[i-k] is not None and e[i] > e[i-k]

def strong_regime(d):
    if not engine.strong_regime(d): return False
    dd = engine._near(d, engine._qix); i = engine._qix[dd] if dd else None
    if i is None or engine._qsma[i] is None or engine._qsma[i-10] is None: return False
    mom = engine.qret(d, 20)
    return engine._qsma[i] > engine._qsma[i-10] and (mom is not None and mom > 0)

def evaluate(ticker, date):
    """Return an opened-position dict if (ticker,date) is rule+regime compliant, else None."""
    bars = engine.load(ticker)
    if not bars: return None
    i = next((k for k, b in enumerate(bars) if b["date"] >= date), None)
    if i is None or i < 30: return None
    ec = [b["close"] for b in bars]; e21 = engine.ema(ec, 21); e21low = engine.ema([b["low"] for b in bars], 21)
    a14 = engine.atr(bars, 14, i)
    if e21[i] is None or a14 in (None, 0) or not _rising(e21, i): return None
    if not (-0.5 <= (bars[i]["close"]-e21[i])/a14 <= 0.5): return None
    t20 = ec[i]/ec[i-20]-1 if i >= 20 else None; q20 = engine.qret(bars[i]["date"], 20)
    rs = (t20-q20) if (t20 is not None and q20 is not None) else -9
    if not (RS_LO <= rs <= RS_HI): return None
    if sorted(x["close"]*(x["vol"] or 0) for x in bars[i-19:i+1])[10] < 100e6: return None
    if not strong_regime(bars[i]["date"]): return None
    ssl = e21low[i]
    if ssl is None: return None
    entry = bars[i]["close"]; risk = entry - ssl
    if risk <= 0 or risk/entry < 0.003: return None
    return dict(ticker=ticker, entry_date=bars[i]["date"], entry=round(entry, 4),
                ssl=round(ssl, 4), risk=round(risk, 4), stop=round(ssl, 4),
                t1=round(entry+2*risk, 4), t2=round(entry+5*risk, 4),
                rem=1.0, hit1=False, hit2=False, realized_R=0.0,
                rs=round(rs, 4), status="open", last_date=bars[i]["date"], events=[])

def advance(pos, today):
    """Walk daily bars from after last_date through today; apply trailing stop + trims + runner."""
    bars = engine.load(pos["ticker"])
    if not bars: return []
    e21low = engine.ema([b["low"] for b in bars], 21)
    start = next((k for k, b in enumerate(bars) if b["date"] > pos["last_date"]), len(bars))
    new_events = []
    for j in range(start, len(bars)):
        b = bars[j]
        if b["date"] > today: break
        pos["last_date"] = b["date"]
        if e21low[j] is not None and e21low[j] > pos["stop"]:
            pos["stop"] = round(e21low[j], 4)
        risk = pos["risk"]; entry = pos["entry"]
        if b["low"] <= pos["stop"]:                              # stop / structure break: exit remainder
            exitR = (pos["stop"]-entry)/risk
            pos["realized_R"] = round(pos["realized_R"] + pos["rem"]*exitR, 3)
            new_events.append(f"EXIT {pos['ticker']} runner/stop @ {pos['stop']} = {exitR:+.2f}R on remainder; "
                              f"trade closed total {pos['realized_R']:+.2f}R")
            pos["rem"] = 0.0; pos["status"] = "closed"; break
        if not pos["hit1"] and b["high"] >= pos["t1"]:
            pos["realized_R"] = round(pos["realized_R"] + (1/3)*2, 3); pos["rem"] -= 1/3; pos["hit1"] = True
            new_events.append(f"TRIM {pos['ticker']} 1/3 @ 2R ({pos['t1']}); banked, running 2/3")
        if not pos["hit2"] and b["high"] >= pos["t2"]:
            pos["realized_R"] = round(pos["realized_R"] + (1/3)*5, 3); pos["rem"] -= 1/3; pos["hit2"] = True
            new_events.append(f"TRIM {pos['ticker']} 1/3 @ 5R ({pos['t2']}); banked, last 1/3 runs")
    pos["events"] += new_events
    return new_events

def scorecard(state):
    closed = [p for p in state["positions"] if p["status"] == "closed"]
    openp = [p for p in state["positions"] if p["status"] == "open"]
    n = len(closed)
    exp = sum(p["realized_R"] for p in closed)/n if n else 0.0
    win = sum(1 for p in closed if p["realized_R"] > 0)/n if n else 0.0
    # mark-to-market open positions for an interim read
    mtm = []
    for p in openp:
        bars = engine.load(p["ticker"])
        if bars: mtm.append(p["realized_R"] + p["rem"]*((bars[-1]["close"]-p["entry"])/p["risk"]))
    return dict(closed=n, open=len(openp), live_exp=round(exp, 3), win=round(win, 3),
                open_mtm_exp=round(sum(mtm)/len(mtm), 3) if mtm else None,
                bt_full=BT_FULL, bt_oos=BT_OOS)

def load_state():
    if os.path.exists(STATE): return json.load(open(STATE))
    return dict(positions=[], seen=[])

def save_state(state):
    os.makedirs(STATE_DIR, exist_ok=True)
    json.dump(state, open(STATE, "w"), indent=2)

def run(candidates, today):
    state = load_state(); alerts = []
    # 1) advance all open positions
    for p in state["positions"]:
        if p["status"] == "open":
            for e in advance(p, today): alerts.append(e)
    # 2) ingest new compliant candidates
    for c in candidates:
        key = f"{c['ticker']}:{c['date']}"
        if key in state["seen"]: continue
        state["seen"].append(key)
        pos = evaluate(c["ticker"], c["date"])
        if pos:
            pos["posted_entry"] = c.get("entry"); pos["posted_sl"] = c.get("sl")
            for e in advance(pos, today): pass  # catch up any same-window action
            state["positions"].append(pos)
            alerts.append(f"NEW SIGNAL [PAPER] {pos['ticker']} compliant on {pos['entry_date']} | "
                          f"entry {pos['entry']} SSL {pos['ssl']} (risk {pos['risk']/pos['entry']*100:.1f}%) | "
                          f"2R {pos['t1']} 5R {pos['t2']} | RS {pos['rs']:+.2f}")
    save_state(state)
    sc = scorecard(state)
    head = (f"SCORECARD: {sc['closed']} closed (live {sc['live_exp']:+.2f}R, win {sc['win']*100:.0f}%) | "
            f"{sc['open']} open" + (f" (mtm {sc['open_mtm_exp']:+.2f}R)" if sc['open_mtm_exp'] is not None else "")
            + f" | backtest {sc['bt_full']:+.2f}R full / {sc['bt_oos']:+.2f}R OOS")
    return alerts, head, sc

# ---- dry run: replay his historical compliant calls to validate the tracker ----
def dry_run():
    calls = engine.load_calls()  # (date,tkr,e,sl) full history
    cands = [dict(ticker=t, date=d, entry=e, sl=sl) for d, t, e, sl in calls]
    global STATE
    STATE = "/tmp/alex_fwd_dryrun_state.json"
    if os.path.exists(STATE): os.remove(STATE)
    alerts, head, sc = run(cands, today="2026-06-09")
    opened = sum(1 for a in alerts if a.startswith("NEW SIGNAL"))
    print(f"DRY RUN over {len(cands)} historical calls -> {opened} compliant signals opened")
    print(head)
    print(f"(expectancy here uses his POSTED entry dates as trigger; backtest fired on any compliant day,\n"
          f" so n differs, but per-trade scale-out R should land in the validated band.)")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--candidates")
    ap.add_argument("--today", default=None)
    a = ap.parse_args()
    if a.dry_run: dry_run(); sys.exit(0)
    import datetime
    today = a.today or engine.load("QQQ")[-1]["date"]
    cands = json.load(open(a.candidates)) if a.candidates else []
    alerts, head, sc = run(cands, today)
    print(head)
    for al in alerts: print(al)
