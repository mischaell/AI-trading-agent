#!/usr/bin/env python3
"""campaigns.py — reconstruct Alex's per-ticker CAMPAIGNS from the 580 calls.

A campaign = chain of same-ticker calls where each next call enters while the
prior leg is still open, or within GAP_DAYS after its exit. Legs simulated
independently with the locked LFD scale-out exit at USD cost (equal weight).

Answers: is the +24.6R pyramiding lever visible in his real call structure?
Which add types carry it — adds into open winners (his rulebook) vs re-entries
after stops (the churn reading)?
"""
import json, os, sys, statistics as st
from datetime import datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "lfd", "harness")); sys.path.insert(0, HERE)
import score_lfd as S
engine = S.engine

GAP_DAYS = 14
CUTOFF = S.CUTOFF

def build_legs():
    strat = dict(S.STRATEGY); strat["filter"] = "all"   # whole book: filters would break chains
    legs = []
    for date, tkr, e, sl in engine.load_calls():
        bars = engine.load(tkr)
        if not bars: continue
        i0 = next((i for i, b in enumerate(bars) if b["date"] >= date), None)
        if i0 is None or i0 < 25: continue
        risk = e - sl
        if risk <= 0: continue
        R, mfe, open_trade, exit_i = S.decide_exit(strat, bars, i0, e, sl, risk)
        cost_R = (S.FX_PCT / 100.0) / (risk / e)
        legs.append(dict(date=date, tkr=tkr, e=e, risk=risk, bars=bars, i0=i0,
                         R_net=round(R - cost_R, 3), open=open_trade,
                         exit_date=bars[exit_i]["date"]))
    return legs

def days(a, b):
    return (datetime.strptime(b, "%Y-%m-%d") - datetime.strptime(a, "%Y-%m-%d")).days

def classify(prev, leg):
    """Type of a non-first leg relative to the previous leg in its campaign."""
    if leg["date"] <= prev["exit_date"] and not prev.get("closed_before"):
        # prior leg still open at add date: MTM in prior-leg R units, close of day before
        pb = prev["bars"]
        j = max((i for i, b in enumerate(pb) if b["date"] < leg["date"]), default=None)
        if j is None: return "add_open_winner"
        mtm = (pb[j]["close"] - prev["e"]) / prev["risk"]
        return "add_open_winner" if mtm > 0 else "add_open_loser"
    return "reentry_after_win" if prev["R_net"] > 0 else "reentry_after_stop"

def main():
    legs = build_legs()
    bytkr = {}
    for l in legs: bytkr.setdefault(l["tkr"], []).append(l)
    campaigns = []
    for tkr, ls in bytkr.items():
        ls.sort(key=lambda l: l["date"])
        cur = [ls[0]]
        for l in ls[1:]:
            prev = cur[-1]
            if l["date"] <= prev["exit_date"] or days(prev["exit_date"], l["date"]) <= GAP_DAYS:
                l["kind"] = classify(prev, l); cur.append(l)
            else:
                campaigns.append(cur); cur = [l]
        campaigns.append(cur)
    for c in campaigns:
        c[0]["kind"] = "first_leg"

    n_multi = sum(1 for c in campaigns if len(c) > 1)
    dist = {}
    for c in campaigns: dist[len(c)] = dist.get(len(c), 0) + 1
    print(f"{len(legs)} legs -> {len(campaigns)} campaigns "
          f"({n_multi} multi-leg, {sum(len(c) for c in campaigns if len(c)>1)} legs in them)")
    print("legs/campaign:", dict(sorted(dist.items())))

    def row(xs):
        if not xs: return "n=  0"
        return (f"n={len(xs):3}  net {st.fmean(xs):+.3f}R  "
                f"win {sum(1 for x in xs if x > 0)/len(xs)*100:3.0f}%  total {sum(xs):+7.1f}R")

    KINDS = ["first_leg", "add_open_winner", "add_open_loser",
             "reentry_after_win", "reentry_after_stop"]
    for split, lo, hi in (("DEV", "", CUTOFF), ("HOLDOUT", CUTOFF, "9999"), ("FULL", "", "9999")):
        print(f"\n=== {split}: expectancy by leg type ===")
        for k in KINDS:
            xs = [l["R_net"] for c in campaigns for l in c
                  if l["kind"] == k and lo <= l["date"] < hi]
            print(f"  {k:18} {row(xs)}")

    # book comparison: what a copier should actually take
    print("\n=== book comparison (FULL sample, equal-weight legs) ===")
    books = {
        "all legs (status quo)": lambda l: True,
        "first legs only":       lambda l: l["kind"] == "first_leg",
        "first + winner-adds":   lambda l: l["kind"] in ("first_leg", "add_open_winner", "reentry_after_win"),
        "drop loser-chasing":    lambda l: l["kind"] not in ("add_open_loser", "reentry_after_stop"),
    }
    for name, f in books.items():
        for split, lo, hi in (("dev", "", CUTOFF), ("hold", CUTOFF, "9999")):
            xs = [l["R_net"] for c in campaigns for l in c if f(l) and lo <= l["date"] < hi]
            print(f"  {name:22} {split:4} {row(xs)}")

    # campaign-level: do multi-leg campaigns out-earn single-leg ones?
    print("\n=== campaign-level total R (all legs summed) ===")
    for label, f in (("single-leg", lambda c: len(c) == 1), ("multi-leg", lambda c: len(c) > 1)):
        xs = [sum(l["R_net"] for l in c) for c in campaigns if f(c)]
        print(f"  {label:11} {row(xs)}")

if __name__ == "__main__":
    main()
