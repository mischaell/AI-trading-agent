#!/usr/bin/env python3
"""score_lfd.py — LFD scorer. Simulates strategy_lfd.py (with engine_ext hooks)
over Alex's full call history, then scores ONE split:

  --split dev      379 calls < 2026-01-01, full detail   (the loop's signal)
  --split holdout  201 calls >= 2026-01-01               (holdout.sh ONLY)
  --split full     everything                            (verifier only)

FX cost is FROZEN here (USD account, 0.10%) — not a strategy knob.
Invoke via score.sh (budget/lint/counter) — not directly — during a run.
"""
import json, os, sys, importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))          # lfd/harness
LFD = os.path.dirname(HERE)                                # lfd
GOLF = os.path.dirname(LFD)                                # strategy-golf
sys.path.insert(0, GOLF)
import engine

CUTOFF = "2026-01-01"
FX_PCT = 0.10                      # frozen: USD-funded account
BAR, MIN_WIN, MIN_N_DEV, MAX_TOP3 = 0.176, 0.38, 150, 0.60

def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m

STRATEGY = _load(os.path.join(LFD, "strategy_lfd.py"), "strat_lfd").STRATEGY
EXT = _load(os.path.join(LFD, "engine_ext.py"), "engine_ext")

def builtin_exit(strat, bars, i0, e, sl, risk):
    """Mirror of engine.simulate's fixed/runner exits, + exit index."""
    mfe = 0.0
    if strat.get("exit_model") == "runner":
        elow = engine.ema([b["low"] for b in bars], 21); stop = sl
        for j in range(i0, len(bars)):
            b = bars[j]; mfe = max(mfe, (b["high"] - e) / risk)
            if elow[j] is not None: stop = max(stop, elow[j])
            if b["close"] < stop:
                return (b["close"] - e) / risk, mfe, False, j
        return (bars[-1]["close"] - e) / risk, mfe, True, len(bars) - 1
    tgt = e + strat.get("target_R", 3) * risk
    for j in range(i0, len(bars)):
        b = bars[j]; mfe = max(mfe, (b["high"] - e) / risk)
        if b["low"] <= sl: return -1.0, mfe, False, j
        if b["high"] >= tgt: return float(strat.get("target_R", 3)), mfe, False, j
    return (bars[-1]["close"] - e) / risk, mfe, True, len(bars) - 1

def decide_entry(strat, bars, p, date, e, e21, a14):
    if strat.get("filter") in ("all", "medium"):
        return engine.passes_filter(strat, bars, p, date, e, e21, a14)
    return EXT.passes_filter_ext(strat, bars, p, date, e, e21, a14)

def decide_exit(strat, bars, i0, e, sl, risk):
    if strat.get("exit_model") in ("fixed", "runner"):
        return builtin_exit(strat, bars, i0, e, sl, risk)
    return EXT.exit_ext(strat, bars, i0, e, sl, risk)

def simulate(strat):
    trades = []
    for date, tkr, e, sl in engine.load_calls():
        bars = engine.load(tkr)
        if not bars: continue
        i0 = next((i for i, b in enumerate(bars) if b["date"] >= date), None)
        if i0 is None or i0 < 25: continue
        p = i0 - 1
        e21 = engine.ema([b["close"] for b in bars[:p + 1]], 21)[p]
        a14 = engine.atr(bars, 14, p)
        if e21 is None or a14 in (None, 0): continue
        ok, rs = decide_entry(strat, bars, p, date, e, e21, a14)
        if not ok: continue
        risk = e - sl
        if risk <= 0: continue
        stop_pct = risk / e
        R, mfe, open_trade, exit_i = decide_exit(strat, bars, i0, e, sl, risk)
        cost_R = (FX_PCT / 100.0) / stop_pct if stop_pct else 0.0
        trades.append(dict(date=date, tkr=tkr, R=round(R, 3),
                           R_net=round(R - cost_R, 3), mfe=round(mfe, 2),
                           open=open_trade, q=engine.quarter(date)))
    return trades

def expectancy(xs): return round(sum(xs) / len(xs), 4) if xs else 0.0
def winrate(xs):    return round(sum(1 for x in xs if x > 0) / len(xs), 4) if xs else 0.0

def score_split(trades):
    xs = [t["R_net"] for t in trades]
    quarters = {}
    for t in trades: quarters.setdefault(t["q"], []).append(t["R_net"])
    by_q = {q: dict(n=len(v), expectancy=expectancy(v)) for q, v in sorted(quarters.items())}
    tot = sum(xs)
    top3 = sorted(xs, reverse=True)[:3]
    return dict(n=len(trades),
                gross=expectancy([t["R"] for t in trades]),
                net=expectancy(xs), win=winrate(xs), total=round(tot, 2),
                by_quarter=by_q,
                q_pos=f"{sum(1 for v in by_q.values() if v['expectancy'] > 0)}/{len(by_q)}",
                top3_concentration=round(sum(top3) / tot, 3) if tot > 0 else None,
                open_trades=sum(1 for t in trades if t["open"]))

def main():
    split = "dev"
    if "--split" in sys.argv: split = sys.argv[sys.argv.index("--split") + 1]
    all_trades = simulate(STRATEGY)
    dev = [t for t in all_trades if t["date"] < CUTOFF]
    hold = [t for t in all_trades if t["date"] >= CUTOFF]

    if split == "dev":
        s = score_split(dev)
        s["strategy"] = STRATEGY
        s["pass_bar_dev_mirror"] = dict(
            D1_net_ge_bar=s["net"] >= BAR, D2_win_ge_38=s["win"] >= MIN_WIN,
            D3_net_positive=s["net"] > 0,
            D4_top3_le_60=(s["top3_concentration"] is not None and s["top3_concentration"] <= MAX_TOP3),
            D5_n_ge_150=s["n"] >= MIN_N_DEV)
        s["ledger_top"] = sorted(dev, key=lambda t: t["R_net"], reverse=True)[:5]
        s["ledger_worst"] = sorted(dev, key=lambda t: t["R_net"])[:3]
        json.dump(s, open(os.path.join(LFD, "score_dev.json"), "w"), indent=2)
        print(f"DEV  n={s['n']}  gross {s['gross']:+.3f}R  net {s['net']:+.3f}R  "
              f"win {s['win'] * 100:.0f}%  total {s['total']:+.1f}R")
        print(f"     quarters+ {s['q_pos']}   top3 {s['top3_concentration']}   "
              f"open {s['open_trades']}")
        for q, v in s["by_quarter"].items():
            print(f"     {q}: {v['expectancy']:+.3f}R (n={v['n']})")
        print("     PASS-bar mirror (dev): " +
              "  ".join(f"{k}={'Y' if v else 'n'}" for k, v in s["pass_bar_dev_mirror"].items()))
        print(f"     -> score_dev.json")
    elif split == "holdout":
        s = score_split(hold); d = score_split(dev)
        full_net = expectancy([t["R_net"] for t in all_trades])
        verdict = dict(
            H1_holdout_net_ge_bar=(s["net"] >= BAR, s["net"]),
            H2_holdout_win_ge_38=(s["win"] >= MIN_WIN, s["win"]),
            H3_all_splits_positive=(d["net"] > 0 and s["net"] > 0 and full_net > 0,
                                    dict(dev=d["net"], holdout=s["net"], full=full_net)),
            H4_top3_le_60=((d["top3_concentration"] or 9) <= MAX_TOP3 and
                           (s["top3_concentration"] or 9) <= MAX_TOP3,
                           dict(dev=d["top3_concentration"], holdout=s["top3_concentration"])),
            H5_dev_n_ge_150=(d["n"] >= MIN_N_DEV, d["n"]))
        out = dict(strategy=STRATEGY, holdout=s, dev=d, full_net=full_net, pass_bar=verdict,
                   overall=all(v[0] for v in verdict.values()))
        json.dump(out, open(os.path.join(LFD, "runs", "holdout-result.json"), "w"), indent=2)
        print(f"HOLDOUT (2026)  n={s['n']}  net {s['net']:+.3f}R  win {s['win'] * 100:.0f}%  "
              f"total {s['total']:+.1f}R  top3 {s['top3_concentration']}")
        for k, (ok, val) in verdict.items():
            print(f"  {'PASS' if ok else 'FAIL'}  {k}  ({val})")
        print(f"  OVERALL: {'PASS' if out['overall'] else 'FAIL'}   -> runs/holdout-result.json")
    else:  # full — verifier only
        print(json.dumps(dict(strategy=STRATEGY, dev=score_split(dev),
                              holdout=score_split(hold),
                              full=score_split(all_trades)), indent=2))

if __name__ == "__main__":
    main()
