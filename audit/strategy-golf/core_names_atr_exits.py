#!/usr/bin/env python3
"""core_names_atr_exits.py — Michael's wide-stop core-names strategy with the
ATR-unified rulebook (2026-07-05). Everything in ATR(14) units:

  buy       $2,500 at close when a name gets its 2nd Alex entry within 90d
  adds      +$2,500 at basis +3*ATR, +$2,500 at basis +6*ATR
  trail     exit all on close < highest-close - 3*ATR
  Rule A    harvest: sell 1/3 when close > EMA21 + 2*ATR (Alex's own extension
            trim); re-arms after price touches EMA21 again; max 2 harvests
  Rule B    tighten with profit: trail 3*ATR -> 2*ATR at +6 ATR gain ->
            1.5*ATR beyond +12 ATR (gain measured from basis in entry-day ATRs)
  Rule C    regime: trail width halves while market state below CONFIRMED/EARLY

Variants: baseline, A, B, C, B+C, A+B+C. Costs: USD acct 0.1%/trade leg,
SIPP 1%/leg. Reports net, worst giveback of open profit, realized vs paper.
Clean data: entries priced from bars; split-artifact immune.
"""
import json, os, sys
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import engine
import stamp as _stamp
_STAMP = _stamp.require_stamp()
_EXCLUDED = set(_STAMP['A_entry_range']['excluded_tickers'])

SLICE = 2500

def d2dt(d): return datetime.strptime(d, "%Y-%m-%d")

def run(useA, useB, useC):
    calls = json.load(open(os.path.join(HERE, "calls_v2.json")))
    states = json.load(open(os.path.join(HERE, "regime_states.json")))
    sdates = sorted(states)
    def risk_on(d):
        p = [x for x in sdates if x < d]
        return bool(p) and states[p[-1]] in ("CONFIRMED_UPTREND", "EARLY_CONFIRMATION")

    entries = {}
    for d, tkr, e, sl, fmt, size in calls:
        entries.setdefault(tkr, []).append(d)

    positions, marks = [], {}
    for tkr, dates in entries.items():
        bars = engine.load(tkr)
        if not bars or len(bars) < 40: continue
        closes = [b["close"] for b in bars]
        e21 = engine.ema(closes, 21)
        dates = sorted(dates)
        pos = None; consumed = -1
        for si, d in enumerate(dates):
            if si <= consumed or pos is not None: continue
            if not [x for x in dates if x < d and (d2dt(d) - d2dt(x)).days <= 90]: continue
            i0 = next((i for i, b in enumerate(bars) if b["date"] >= d), None)
            if i0 is None or i0 < 20: continue
            a0 = engine.atr(bars, 14, i0)
            if not a0: continue
            px = closes[i0]
            pos = dict(basis=px, atr0=a0, lots=[(SLICE / px, px)], peak=px,
                       adds=0, harvests=0, armed=True, realized=0.0, legs=1,
                       opened=bars[i0]["date"])
            j = i0 + 1
            while j < len(bars):
                b = bars[j]; c = b["close"]
                a = engine.atr(bars, 14, j) or a0
                pos["peak"] = max(pos["peak"], c)
                gain_atr = (c - pos["basis"]) / pos["atr0"]
                # adds on strength (in ATRs of entry day)
                while pos["adds"] < 2 and gain_atr >= 3 * (pos["adds"] + 1):
                    pos["lots"].append((SLICE / c, c)); pos["adds"] += 1; pos["legs"] += 1
                # Rule A: harvest extension above EMA21
                if useA and e21[j] is not None:
                    if pos["armed"] and pos["harvests"] < 2 and c > e21[j] + 2 * a:
                        sh = sum(s for s, _ in pos["lots"]) / 3
                        cost_share = sum(s * p for s, p in pos["lots"]) / 3
                        pos["realized"] += sh * c - cost_share
                        pos["lots"] = [(s * 2 / 3, p) for s, p in pos["lots"]]
                        pos["harvests"] += 1; pos["armed"] = False; pos["legs"] += 1
                    if not pos["armed"] and c <= e21[j]:
                        pos["armed"] = True
                # trail width
                w = 3.0
                if useB:
                    if gain_atr > 12: w = 1.5
                    elif gain_atr > 6: w = 2.0
                if useC and not risk_on(b["date"]): w = w / 2
                if c < pos["peak"] - w * a:
                    cost = sum(s * p for s, p in pos["lots"])
                    pnl = pos["realized"] + sum(s for s, _ in pos["lots"]) * c - cost
                    positions.append(dict(tkr=tkr, opened=pos["opened"], closed=b["date"],
                                          cost=cost + pos["harvests"] * 0,
                                          legs=pos["legs"] + 1, pnl=pnl,
                                          realized=pnl, paper=0.0, status="closed",
                                          notional=SLICE * (1 + pos["adds"])))
                    pos = None
                    consumed = max((k for k, dd in enumerate(dates) if dd <= b["date"]), default=si)
                    break
                mtm = pos["realized"] + sum(s for s, _ in pos["lots"]) * c - sum(s * p for s, p in pos["lots"])
                marks[b["date"]] = marks.get(b["date"], 0.0) + mtm
                j += 1
            if pos is not None:
                cost = sum(s * p for s, p in pos["lots"])
                paper = sum(s for s, _ in pos["lots"]) * closes[-1] - cost
                positions.append(dict(tkr=tkr, opened=pos["opened"], closed=None,
                                      legs=pos["legs"], pnl=pos["realized"] + paper,
                                      realized=pos["realized"], paper=paper, status="OPEN",
                                      notional=SLICE * (1 + pos["adds"])))
                pos = "sealed"
    return positions, marks

def giveback(marks):
    peak = -1e18; dd = 0.0
    for d in sorted(marks):
        peak = max(peak, marks[d])
        dd = max(dd, peak - marks[d])
    return dd

def main():
    variants = [("baseline (trail only)", 0,0,0), ("A harvest", 1,0,0), ("B tighten w/ profit", 0,1,0),
                ("C regime tighten", 0,0,1), ("B+C", 0,1,1), ("A+B+C", 1,1,1)]
    # contributor tracing (mandatory): top-5 positions of every variant are
    # printed with dates so each can be checked against Tier-1 facts
    TRACE = True
    print(f"{'variant':22}{'yr':5}{'n':>4}{'legs':>5}{'gross':>10}{'netUSD':>10}{'netSIPP':>10}"
          f"{'realized':>10}{'paper':>9}")
    for name, a, b, c in variants:
        positions, marks = run(a, b, c)
        for year in ("2025", "2026"):
            ps = [p for p in positions if (p["opened"][:4] == year) or (year == "2025" and p["opened"][:4] == "2024")]
            if not ps: continue
            gross = sum(p["pnl"] for p in ps)
            legs = sum(p["legs"] for p in ps)
            avg_leg_notional = sum(p["notional"] for p in ps) / max(legs, 1)
            fx_usd = legs * avg_leg_notional * 0.001
            fx_sipp = legs * avg_leg_notional * 0.01
            realized = sum(p["realized"] for p in ps)
            paper = sum(p["paper"] for p in ps)
            print(f"{name:22}{year:5}{len(ps):>4}{legs:>5}{gross:>+10,.0f}{gross-fx_usd:>+10,.0f}"
                  f"{gross-fx_sipp:>+10,.0f}{realized:>+10,.0f}{paper:>+9,.0f}")
            if TRACE:
                for p in sorted(ps, key=lambda p: -abs(p["pnl"]))[:5]:
                    print(f"      trace: {p['tkr']:5} {p['opened']} -> {p['closed'] or 'OPEN'}  ${p['pnl']:+,.0f}")
        print(f"{'':22}worst open-profit giveback ${giveback(marks):,.0f}")

if __name__ == "__main__":
    main()
