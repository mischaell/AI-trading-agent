#!/usr/bin/env python3
"""confluence.py — live WC/B/C/G flags + FULL/HALF tier for new Alex calls.

Backtest-validated rule set (confluence book v2, 2026-07-03):
  WC winner-continuation — his prior leg in the ticker is an open winner, or
     closed positive <=14 days before this entry. Legs are judged by the
     UNCAPPED behavioral exit (half off at +1R, 21EMA-low ratchet trail, exit
     on 2 consecutive closes below the trail, NO profit cap) — the 4R-capped
     judge closes winning campaigns months early (NBIS 2026) and mislabels
     live continuations; uncapped-judged WC scored 2026 FULL +0.76R vs +0.49R.
  B  single-call day — this is his only entry call that date
  C  moderate RS — 20d relative strength vs QQQ in [0.05, 0.20]
  G  regime — 5-state machine reads CONFIRMED_UPTREND or EARLY_CONFIRMATION
Tier: score >=3 -> FULL (1% risk) | score == 2 -> HALF (0.5%) | else skip.

State: calls_live.json (running v2-format call history, seeded from the
audit's calls_v2.json), regime_states.json (written by refresh_data.py).
Bars must be refreshed by refresh_data.py BEFORE this module is used.
"""
import json, os, sys
from datetime import datetime

STATE_DIR = os.path.expanduser("~/mission-control/alex-forward-test")
CALLS_LIVE = os.path.join(STATE_DIR, "calls_live.json")
REGIME = os.path.join(STATE_DIR, "regime_states.json")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engine

def _days(a, b):
    return (datetime.strptime(b, "%Y-%m-%d") - datetime.strptime(a, "%Y-%m-%d")).days

def load_calls_live():
    return json.load(open(CALLS_LIVE)) if os.path.exists(CALLS_LIVE) else []

def append_candidates(cands):
    """Add today's pulled candidates (any score) to the running call history."""
    calls = load_calls_live()
    seen = {(c[0], c[1]) for c in calls}
    added = 0
    for c in cands:
        key = (c["date"], c["ticker"])
        if key in seen: continue
        calls.append([c["date"], c["ticker"], float(c["entry"]), float(c["sl"]),
                      c.get("fmt", "LON"), float(c.get("size_pct", 0))])
        seen.add(key); added += 1
    calls.sort(key=lambda x: x[0])
    json.dump(calls, open(CALLS_LIVE, "w"))
    return added

def exit_scale(bars, i0, e, sl, risk, t1=1.0, f1=0.5, confirm=2):
    """UNCAPPED behavioral exit for WC leg-judging -> (R, open?, exit_index).
    Half off at +t1 R, then 21EMA-low ratchet trail; the remainder exits only
    after `confirm` consecutive closes below the trail. No profit cap."""
    elow = engine.ema([b["low"] for b in bars], 21)
    p1 = e + t1 * risk
    took = False; stop = sl; booked = 0.0; wt = 1.0; below = 0
    for j in range(i0, len(bars)):
        b = bars[j]
        if not took:
            if b["low"] <= sl: return -1.0, False, j
            if b["high"] >= p1:
                booked += f1 * t1; wt -= f1; took = True
                if elow[j] is not None and elow[j] > stop: stop = elow[j]
                continue
        else:
            if elow[j] is not None and elow[j] > stop: stop = elow[j]
            below = below + 1 if b["close"] < stop else 0
            if below >= confirm:
                return booked + wt * (stop - e) / risk, False, j
    last = (bars[-1]["close"] - e) / risk
    return (booked + wt * last, True, len(bars) - 1) if took else (last, True, len(bars) - 1)

def _sim_leg(tkr, date, e, sl):
    bars = engine.load(tkr)
    if not bars: return None
    i0 = next((i for i, b in enumerate(bars) if b["date"] >= date), None)
    if i0 is None or i0 < 25: return None
    risk = e - sl
    if risk <= 0: return None
    R, open_t, xi = exit_scale(bars, i0, e, sl, risk)
    return dict(entry=e, risk=risk, R=R, open=open_t, exit_date=bars[xi]["date"], bars=bars)

def wc_flag(tkr, date):
    """Prior leg in this ticker: open winner at `date`, or closed +ve <=14d before."""
    prior = [c for c in load_calls_live() if c[1] == tkr and c[0] < date]
    if not prior: return False
    d0, _, e0, sl0, *_ = prior[-1]
    leg = _sim_leg(tkr, d0, e0, sl0)
    if not leg: return False
    if leg["exit_date"] >= date:                      # still open when this call fired
        pb = leg["bars"]
        j = max((i for i, b in enumerate(pb) if b["date"] < date), default=None)
        if j is None: return False
        return (pb[j]["close"] - leg["entry"]) / leg["risk"] > 0
    return leg["R"] > 0 and _days(leg["exit_date"], date) <= 14

def b_flag(date):
    return sum(1 for c in load_calls_live() if c[0] == date) == 1

def c_flag(tkr, date):
    bars = engine.load(tkr)
    if not bars: return False
    i0 = next((i for i, b in enumerate(bars) if b["date"] >= date), None)
    if i0 is None or i0 < 21: return False
    p = i0 - 1
    if p < 20: return False
    t20 = bars[p]["close"] / bars[p - 20]["close"] - 1
    q20 = engine.qret(bars[p]["date"], 20)
    if q20 is None: return False
    return 0.05 <= (t20 - q20) <= 0.20

def g_flag(date):
    if not os.path.exists(REGIME): return False
    states = json.load(open(REGIME))
    prior = [d for d in sorted(states) if d < date]
    return bool(prior) and states[prior[-1]] in ("CONFIRMED_UPTREND", "EARLY_CONFIRMATION")

BARS = os.environ.get("SG_CACHE_DIR", os.path.join(STATE_DIR, ".barcache"))

def internals(date):
    """LOGGED-ONLY internals pillar (v1, frozen 2026-07-04) — Alex's 'credit
    cracks before equities'. Not part of the score or tier; accumulates a live
    track record for the Q1 blind spot. Causal: uses data strictly before
    `date`. Risk-off when >=2 of 3 fire:
      credit_off    HYG/SHY ratio < its 21EMA
      vix_off       VIX close > its 21EMA AND >= 18
      defensive_off XLK/XLP ratio < its 21EMA
    Returns (ok, detail): ok=None if data missing (logged loudly, never guessed).
    """
    def closes(sym):
        p = os.path.join(BARS, sym + ".json")
        if not os.path.exists(p): return None
        try:
            return {b["date"]: b["close"] for b in json.load(open(p)) if b["date"] < date}
        except (ValueError, KeyError, OSError):
            return None
    hyg, shy, xlk, xlp, vix = (closes(s) for s in ("HYG", "SHY", "XLK", "XLP", "^VIX"))
    if not all((hyg, shy, xlk, xlp, vix)):
        return None, "no-data"
    def ratio_off(a, b):
        ds = sorted(set(a) & set(b))
        if len(ds) < 30: return None
        r = [a[d] / b[d] for d in ds]
        return r[-1] < engine.ema(r, 21)[-1]
    c_off = ratio_off(hyg, shy)
    d_off = ratio_off(xlk, xlp)
    vds = sorted(vix)
    if len(vds) < 30 or c_off is None or d_off is None:
        return None, "no-data"
    vs = [vix[d] for d in vds]
    v_off = vs[-1] > engine.ema(vs, 21)[-1] and vs[-1] >= 18
    hits = [n for n, off in (("credit", c_off), ("vix", v_off), ("defensive", d_off)) if off]
    return len(hits) < 2, "+".join(hits) or "clear"

def tier_for(cand):
    """-> (tier|None, flags_string, score). Call AFTER append_candidates."""
    tkr, date = cand["ticker"], cand["date"]
    f = dict(WC=wc_flag(tkr, date), B=b_flag(date),
             C=c_flag(tkr, date), G=g_flag(date))
    score = sum(f.values())
    tier = "FULL" if score >= 3 else ("HALF" if score == 2 else None)
    return tier, "+".join(k for k, v in f.items() if v) or "-", score
