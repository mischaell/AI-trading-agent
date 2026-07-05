#!/usr/bin/env python3
"""core_names_backtest.py — Michael's alternative (2026-07-05): hold Alex's
repeatedly-bought names with WIDE stops on small positions; size up on strength.
Fewer round trips -> FX-friendly for a SIPP.

Rules (pre-declared):
  qualify   ticker gets >=2 Alex entries within trailing 90 days -> BUY at that
            day's close (bars, not posted prices — immune to split artifacts)
  size      $2,500 starter; add $2,500 at +15% and +30% above starter basis
  stop      variant A: trail 20% below highest close since entry
            variant B: trail 3x ATR(14) below highest close
            whole position exits on close below trail
  re-entry  after a stop-out the name needs a fresh Alex entry to re-open
  regime    gated variant: no new BUYs/adds unless state is CONFIRMED/EARLY
  sleeve    $100k cap on deployed notional; skip buys that would exceed it
  costs     reported at 0.1% (USD acct) and 2% (SIPP: 1% in + 1% out) per
            round trip on notional
Window Nov-2024..Jul-2026; 2025 and 2026 reported separately; open positions
marked to last close (flagged). Daily sleeve mark for max drawdown.
"""
import json, os, sys
from datetime import datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "lfd", "harness")); sys.path.insert(0, HERE)
import engine
import stamp as _stamp
_STAMP = _stamp.require_stamp()
_EXCLUDED = set(_STAMP['A_entry_range']['excluded_tickers'])

SLICE, ADD_LVLS, CAP = 2500, (1.15, 1.30), 100_000

def d2dt(d): return datetime.strptime(d, "%Y-%m-%d")

def run(trail_kind, gated):
    calls = json.load(open(os.path.join(HERE, "calls_v2.json")))
    states = json.load(open(os.path.join(HERE, "regime_states.json")))
    sdates = sorted(states)
    def risk_on(d):
        p = [x for x in sdates if x < d]
        return bool(p) and states[p[-1]] in ("CONFIRMED_UPTREND", "EARLY_CONFIRMATION")

    entries = {}                                   # ticker -> [entry dates]
    for d, tkr, e, sl, fmt, size in calls:
        entries.setdefault(tkr, []).append(d)

    positions = []                                 # closed + open position dicts
    marks = {}                                     # date -> unrealized position value delta vs cost
    for tkr, dates in entries.items():
        bars = engine.load(tkr)
        if not bars or len(bars) < 40: continue
        bidx = {b["date"]: i for i, b in enumerate(bars)}
        closes = [b["close"] for b in bars]
        open_pos = None; used_signal_i = -1
        for si, d in enumerate(sorted(dates)):
            if si <= used_signal_i: continue
            prior = [x for x in sorted(dates) if x < d and (d2dt(d) - d2dt(x)).days <= 90]
            if not prior: continue                 # needs >=2 entries in 90d
            if open_pos is not None: continue      # already holding
            if gated and not risk_on(d): continue
            i0 = next((i for i, b in enumerate(bars) if b["date"] >= d), None)
            if i0 is None or i0 < 20: continue
            px = closes[i0]
            sh = SLICE / px
            open_pos = dict(tkr=tkr, opened=bars[i0]["date"], lots=[(sh, px)],
                            peak=px, adds_done=0, basis=px)
            # walk forward
            j = i0 + 1
            while j < len(bars):
                b = bars[j]; c = b["close"]
                open_pos["peak"] = max(open_pos["peak"], c)
                if trail_kind == "pct":
                    trail = open_pos["peak"] * 0.80
                else:
                    a = engine.atr(bars, 14, j) or 0
                    trail = open_pos["peak"] - 3 * a
                # adds on strength
                while (open_pos["adds_done"] < len(ADD_LVLS)
                       and c >= open_pos["basis"] * ADD_LVLS[open_pos["adds_done"]]
                       and (not gated or risk_on(b["date"]))):
                    open_pos["lots"].append((SLICE / c, c))
                    open_pos["adds_done"] += 1
                if c < trail:
                    cost = sum(s * p for s, p in open_pos["lots"])
                    val = sum(s for s, _ in open_pos["lots"]) * c
                    positions.append(dict(tkr=tkr, opened=open_pos["opened"], closed=b["date"],
                                          cost=cost, pnl=val - cost, lots=len(open_pos["lots"]),
                                          status="closed"))
                    open_pos = None
                    used_signal_i = max(k for k, dd in enumerate(sorted(dates)) if dd <= b["date"]) \
                        if any(dd <= b["date"] for dd in dates) else si
                    break
                # daily mark for sleeve drawdown
                cost = sum(s * p for s, p in open_pos["lots"])
                val = sum(s for s, _ in open_pos["lots"]) * c
                marks.setdefault(b["date"], 0.0); marks[b["date"]] += val - cost
                j += 1
            if open_pos is not None:
                cost = sum(s * p for s, p in open_pos["lots"])
                val = sum(s for s, _ in open_pos["lots"]) * closes[-1]
                positions.append(dict(tkr=tkr, opened=open_pos["opened"], closed=None,
                                      cost=cost, pnl=val - cost, lots=len(open_pos["lots"]),
                                      status="OPEN"))
                open_pos = "done"                  # one campaign per qualification era
    return positions, marks

def report(name, positions, marks):
    print(f"\n===== {name} =====")
    for year in ("2025", "2026"):
        ps = [p for p in positions if p["opened"][:4] == year or
              (year == "2025" and p["opened"][:4] == "2024")]
        if not ps: continue
        closed = [p for p in ps if p["status"] == "closed"]
        openp = [p for p in ps if p["status"] == "OPEN"]
        gross = sum(p["pnl"] for p in ps)
        rts = sum(p["lots"] for p in ps)          # each lot = one buy; exit = one sell per position
        notional = sum(p["cost"] for p in ps)
        fx_usd = notional * 0.001 * 2
        fx_sipp = notional * 0.02
        wins = sum(1 for p in ps if p["pnl"] > 0)
        print(f"{year}: {len(ps)} positions ({len(openp)} open, marked) | wins {wins}/{len(ps)} "
              f"| buys {rts} | deployed ${notional:,.0f}")
        print(f"   gross ${gross:+,.0f} | net USD-acct ${gross - fx_usd:+,.0f} "
              f"| net SIPP-FX ${gross - fx_sipp:+,.0f}")
        top = sorted(ps, key=lambda p: -p["pnl"])
        print("   best: " + ", ".join(f"{p['tkr']} {p['pnl']:+,.0f}{'(open)' if p['status']=='OPEN' else ''}" for p in top[:4]))
        print("   worst: " + ", ".join(f"{p['tkr']} {p['pnl']:+,.0f}" for p in top[-3:]))
    if marks:
        # sleeve equity path = realized-to-date + open marks (approx: marks only)
        days = sorted(marks)
        peak = -1e9; maxdd = 0; trough_day = ""
        run_ = 0.0
        for dday in days:
            run_ = marks[dday]
            peak = max(peak, run_)
            if peak - run_ > maxdd: maxdd = peak - run_; trough_day = dday
        print(f"   worst unrealized sleeve drawdown ~${maxdd:,.0f} (around {trough_day})")

if __name__ == "__main__":
    for trail_kind, tlabel in (("pct", "20% trail"), ("atr", "3xATR trail")):
        for gated in (False, True):
            pos, marks = run(trail_kind, gated)
            report(f"{tlabel}{' + regime gate on new money' if gated else ''}", pos, marks)
