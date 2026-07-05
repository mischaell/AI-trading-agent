#!/usr/bin/env python3
"""catchup_test.py — add-timing evidence (2026-07-06).

Part 1  continuation curve: for every qualifying probe (A18 rules, one_book
        exits with NO adds), the maximum gain in entry-day ATRs reached before
        the trail exit -> conditional continuation probabilities.
Part 2  the agreed catch-up ladder ($2,500 probe -> $11k -> $19k -> $28k,
        in-profit gate) with ONLY the trigger varied:
          T2  price reaches +2 / +4 / +6 ATR above basis
          T3  price reaches +3 / +6 / +9 ATR
          TA  Alex posts another call in the name (any distance), in profit
        Same qualification, same exits (3xATR trail, 2x/1.5x tightening,
        regime halving, single close). Costs 0.1%/leg USD, 1%/leg SIPP.
"""
import json, os, sys
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import engine
import stamp as _stamp
_STAMP = _stamp.require_stamp()

PROBE, TARGETS = 2500, [11000, 19000, 28000]
CORE, RET = 90, 540

def days(a, b): return (datetime.strptime(b, "%Y-%m-%d") - datetime.strptime(a, "%Y-%m-%d")).days

def load_world():
    calls = json.load(open(os.path.join(HERE, "calls_v2.json")))
    states = json.load(open(os.path.join(HERE, "regime_states.json")))
    sdates = sorted(states)
    def risk_on(d):
        p = [x for x in sdates if x < d]
        return bool(p) and states[p[-1]] in ("CONFIRMED_UPTREND", "EARLY_CONFIRMATION")
    bytkr = {}
    for d, tkr, e, sl, fmt, size in calls:
        bytkr.setdefault(tkr, []).append(d)
    return bytkr, risk_on

def walk(mode):
    """mode: 'none' | 'T2' | 'T3' | 'TA'. Returns positions + (for none) max-gain list."""
    bytkr, risk_on = load_world()
    lvls = {"T2": [2, 4, 6], "T3": [3, 6, 9]}.get(mode)
    positions, maxgains = [], []
    for tkr, dates in bytkr.items():
        bars = engine.load(tkr)
        if not bars or len(bars) < 40: continue
        dates = sorted(dates)
        pos = None; consumed = -1; last_core = None
        for si, d in enumerate(dates):
            if si <= consumed or pos is not None: continue
            two = bool([x for x in dates if x < d and days(x, d) <= CORE])
            ret = last_core and days(last_core, d) <= RET
            if not (two or ret): continue
            i0 = next((i for i, b in enumerate(bars) if b["date"] >= d), None)
            if i0 is None or i0 < 20: continue
            a0 = engine.atr(bars, 14, i0)
            if not a0: continue
            last_core = d
            px = bars[i0]["close"]
            pos = dict(basis=px, atr0=a0, lots=[(PROBE / px, px)], peak=px,
                       stage=0, legs=1, opened=bars[i0]["date"], maxg=0.0)
            j = i0 + 1
            while j < len(bars):
                b = bars[j]; c = b["close"]
                a = engine.atr(bars, 14, j) or a0
                pos["peak"] = max(pos["peak"], c)
                gain = (c - pos["basis"]) / pos["atr0"]
                pos["maxg"] = max(pos["maxg"], gain)
                # adds
                def do_add():
                    tgt = TARGETS[pos["stage"]]
                    val = sum(s for s, _ in pos["lots"]) * c
                    if val < tgt:
                        pos["lots"].append(((tgt - val) / c, c)); pos["legs"] += 1
                    pos["stage"] += 1
                if pos["stage"] < 3:
                    if lvls and gain >= lvls[pos["stage"]]:
                        do_add()
                    elif mode == "TA":
                        while consumed < si: consumed = si  # noop clarity
                        # his next call today?
                        if any(dd == b["date"] for dd in dates) and c > pos["basis"]:
                            do_add()
                # consume his calls that occur while position open (any mode)
                while True:
                    nxt = next((k for k in range(si + 1, len(dates)) if dates[k] <= b["date"] and k > consumed), None)
                    if nxt is None: break
                    consumed = nxt
                w = 3.0
                if gain > 12: w = 1.5
                elif gain > 6: w = 2.0
                if not risk_on(b["date"]): w /= 2
                if c < pos["peak"] - w * a:
                    cost = sum(s * p for s, p in pos["lots"])
                    positions.append(dict(tkr=tkr, opened=pos["opened"], closed=b["date"],
                                          legs=pos["legs"] + 1, cost=cost,
                                          pnl=sum(s for s, _ in pos["lots"]) * c - cost))
                    maxgains.append(pos["maxg"]); pos = None
                    break
                j += 1
            if pos is not None:
                cost = sum(s * p for s, p in pos["lots"])
                positions.append(dict(tkr=tkr, opened=pos["opened"], closed=None,
                                      legs=pos["legs"], cost=cost,
                                      pnl=sum(s for s, _ in pos["lots"]) * bars[-1]["close"] - cost))
                maxgains.append(pos["maxg"]); pos = "sealed"
    return positions, maxgains

def main():
    # Part 1: continuation curve
    _, mg = walk("none")
    n = len(mg)
    print(f"PART 1 — continuation curve ({n} probes, A18 qualification, one_book exits):")
    TH = [1, 2, 3, 4, 6, 9, 12]
    counts = {t: sum(1 for g in mg if g >= t) for t in TH}
    print("  reached:", "  ".join(f"+{t}ATR:{counts[t]} ({counts[t]/n*100:.0f}%)" for t in TH))
    for frm in (2, 3):
        row = []
        for to in (4, 6, 9):
            if counts[frm]:
                row.append(f"P(+{to}|+{frm}) = {counts[to]/counts[frm]*100:.0f}%")
        print("  " + "   ".join(row))
    # Part 2: ladder with varied trigger
    print(f"\nPART 2 — catch-up ladder 2.5k->11k->19k->28k, trigger varied:")
    print(f"{'trigger':28}{'yr':6}{'n':>4}{'gross':>10}{'netUSD':>10}{'netSIPP':>10}{'losses':>10}{'worst':>9}")
    for mode, label in (("T2", "price +2/+4/+6 ATR"), ("T3", "price +3/+6/+9 ATR"), ("TA", "when Alex adds (in profit)")):
        positions, _ = walk(mode)
        for year in ("2025", "2026"):
            ps = [p for p in positions if p["opened"][:4] == year or (year == "2025" and p["opened"][:4] == "2024")]
            if not ps: continue
            gross = sum(p["pnl"] for p in ps)
            legs = sum(p["legs"] for p in ps)
            avg = sum(p["cost"] for p in ps) / max(legs, 1)
            losses = sum(p["pnl"] for p in ps if p["pnl"] < 0)
            print(f"{label:28}{year:6}{len(ps):>4}{gross:>+10,.0f}{gross-legs*avg*0.001:>+10,.0f}"
                  f"{gross-legs*avg*0.01:>+10,.0f}{losses:>+10,.0f}{min(p['pnl'] for p in ps):>+9,.0f}")

if __name__ == "__main__":
    main()
