#!/usr/bin/env python3
"""campaigns_backtest.py — campaign-unit management policies on the v2 call set.

Changes the unit of account from call to CAMPAIGN (one position per ticker,
pilot -> escalate -> campaign stop). Policies (parameters pre-declared, no
tuning; USD cost 0.10% per tranche):

  P0 status-quo  every leg independent at 1.0u, capped scale-out (current book)
  P1 starts-only first leg of each campaign at 1.0u, capped scale-out
  P2 campaign    pilot 0.25u at campaign start; each later Alex call in the
                 ticker while the campaign is OPEN and pilot-MTM > 0 adds
                 0.375u at that call's entry/SL (cap 1.0u total; adds into
                 losers ignored — the falsified leg class); exit ALL on
                 2 consecutive closes below the 21EMA-low ratchet, or any
                 close below the pilot's posted SL
  P3 = P2 + bank half of every open tranche when price first reaches
                 pilot_entry + 2*pilot_risk (win-rate stabilizer)

Fair comparison metric: R per unit of risk deployed (policies risk different
totals). Split by campaign START date (dev < 2026-01-01 <= holdout).
"""
import json, os, sys, statistics as st

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "lfd", "harness")); sys.path.insert(0, HERE)
import score_lfd as S
engine = S.engine

FX = S.FX_PCT / 100.0
CUT = "2026-01-01"
PILOT_U, ADD_U, MAX_U = 0.25, 0.375, 1.0

def cost_R(u, e, risk):
    return u * FX / (risk / e)

def leg_capped(bars, i0, e, sl, risk):
    R, _, _, _ = S.decide_exit(dict(S.STRATEGY, filter="all"), bars, i0, e, sl, risk)
    return R - FX / (risk / e)

def campaign_policy(bars, elow, calls, bank_half):
    """calls = [(date, e, sl, i0), ...] chronological, same ticker.
    Consumes calls into campaigns; returns (campaign_results, n_consumed_calls).
    Each result: dict(start, R_units, units, exit_date)."""
    results = []
    k = 0
    while k < len(calls):
        d0, e0, sl0, i0 = calls[k]; k += 1
        tranches = [dict(e=e0, sl=sl0, risk=e0 - sl0, u=PILOT_U)]
        units = PILOT_U
        stop = sl0; below = 0; banked = 0.0; took2R = False
        p2r = e0 + 2 * (e0 - sl0)
        exit_j = None; exit_px = None
        j = i0
        while j < len(bars):
            b = bars[j]
            # adds: any pending call ON this bar date while pilot in profit
            while k < len(calls) and calls[k][0] <= b["date"]:
                da, ea, sla, ia = calls[k]
                prev = bars[j - 1]["close"] if j > 0 else e0
                if prev > e0 and units + ADD_U <= MAX_U + 1e-9 and ea > sla:
                    tranches.append(dict(e=ea, sl=sla, risk=ea - sla, u=ADD_U))
                    units += ADD_U
                k += 1                        # in-profit gate failed -> call ignored
            if elow[j] is not None and elow[j] > stop: stop = elow[j]
            if bank_half and not took2R and b["high"] >= p2r:
                for t in tranches:
                    banked += (t["u"] / 2) * (p2r - t["e"]) / t["risk"]
                    t["u"] /= 2
                took2R = True
            # per-tranche hard stop: each add is protected by its OWN posted SL
            # (Alex posts an SSL with every ADD; the campaign trail protects the
            # pilot, the tranche SL bounds the add)
            for t in tranches:
                if t["u"] > 0 and b["close"] < t["sl"] and t["e"] != e0:
                    banked += t["u"] * (b["close"] - t["e"]) / t["risk"]
                    t["u"] = 0.0
            below = below + 1 if b["close"] < stop else 0
            if b["close"] < sl0 or below >= 2:
                exit_j, exit_px = j, min(b["close"], max(stop, sl0)) if below >= 2 else b["close"]
                break
            j += 1
        if exit_j is None:
            exit_j, exit_px = len(bars) - 1, bars[-1]["close"]
        R = banked + sum(t["u"] * (exit_px - t["e"]) / t["risk"] for t in tranches)
        R -= sum(cost_R(max(t["u"], 0.0) or (PILOT_U if t["e"] == e0 else ADD_U), t["e"], t["risk"]) for t in tranches)
        results.append(dict(start=d0, R=round(R, 3), units=round(units, 3),
                            exit_date=bars[exit_j]["date"]))
        # skip any calls that fired before this campaign's exit but were ignored:
        # they were consumed above; next unconsumed call starts a new campaign
    return results

def main():
    calls = json.load(open(os.path.join(HERE, "calls_v2.json")))
    bytkr = {}
    for d, tkr, e, sl, fmt, size in calls:
        if tkr in _EXCLUDED: continue   # split-corrupted posted prices (dataset stamp)
        bars = engine.load(tkr)
        if not bars: continue
        i0 = next((i for i, b in enumerate(bars) if b["date"] >= d), None)
        if i0 is None or i0 < 25 or e - sl <= 0: continue
        bytkr.setdefault(tkr, dict(bars=bars, calls=[]))["calls"].append((d, e, sl, i0))

    P = {name: {"dev": [], "hold": []} for name in ("P0", "P1", "P2", "P3")}
    for tkr, x in bytkr.items():
        bars, cs = x["bars"], sorted(x["calls"])
        elow = engine.ema([b["low"] for b in bars], 21)
        # P0: every leg, 1.0u capped
        for d, e, sl, i0 in cs:
            P["P0"]["dev" if d < CUT else "hold"].append(dict(R=leg_capped(bars, i0, e, sl, e - sl), units=1.0, start=d))
        # campaign chaining for P1 (starts = P2 campaign starts)
        for bank, name in ((False, "P2"), (True, "P3")):
            for r in campaign_policy(bars, elow, cs, bank):
                P[name]["dev" if r["start"] < CUT else "hold"].append(r)
        for r in campaign_policy(bars, elow, cs, False):
            d = r["start"]
            e_sl = next((c for c in cs if c[0] == d), None)
            if e_sl:
                d0, e, sl, i0 = e_sl
                P["P1"]["dev" if d < CUT else "hold"].append(dict(R=leg_capped(bars, i0, e, sl, e - sl), units=1.0, start=d))

    print(f"{'policy':4} {'split':5} {'n':>4} {'meanR':>8} {'win':>5} {'totalR':>8} {'units':>7} {'R/unit':>7} {'maxloss':>8} {'top3':>6}")
    for name in ("P0", "P1", "P2", "P3"):
        for split in ("dev", "hold"):
            rs = P[name][split]
            if not rs: continue
            xs = [r["R"] for r in rs]
            units = sum(r["units"] for r in rs)
            tot = sum(xs)
            top3 = round(sum(sorted(xs, reverse=True)[:3]) / tot, 2) if tot > 0 else None
            print(f"{name:4} {split:5} {len(xs):>4} {st.fmean(xs):>+8.3f} "
                  f"{sum(1 for x in xs if x > 0)/len(xs):>5.2f} {tot:>+8.1f} {units:>7.1f} "
                  f"{tot/units:>+7.3f} {min(xs):>+8.2f} {str(top3):>6}")

if __name__ == "__main__":
    main()
