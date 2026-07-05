#!/usr/bin/env python3
"""backtest.py — run strategy.py over full history, emit the rubric-checkable
score.json + a human report. This is the loop's "poll the log, read the score"
step. It SCORES; it does not judge — the independent verifier sub-agent grades
score.json against the 9-criterion rubric (rubric.md).

Usage: python3 audit/strategy-golf/backtest.py [strategy_file] [score_out]
  defaults: strategy.py  ->  score.json
Writes the score JSON and prints a report.
"""
import json, os, sys, importlib.util
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import engine

_strat_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "strategy.py")
_score_out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "score.json")
_spec = importlib.util.spec_from_file_location("strat_mod", _strat_path)
_m = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_m)
STRATEGY = _m.STRATEGY

# Baseline to beat (from learnings-alex.md / audit memory): Alex's posted record.
BASELINE_R = 0.147      # his expectancy per trade
BASELINE_WIN = 0.38     # his win rate
GOAL_UPLIFT = 0.20      # require >=20% over baseline expectancy
GOAL_R = round(BASELINE_R * (1 + GOAL_UPLIFT), 3)   # >= +0.176R net, OOS

def expectancy(xs): return round(sum(xs)/len(xs), 4) if xs else 0.0
def winrate(xs):    return round(sum(1 for x in xs if x > 0)/len(xs), 4) if xs else 0.0

def metrics(trades, key="R"):
    xs = [t[key] for t in trades]
    return dict(n=len(trades), expectancy=expectancy(xs), win=winrate(xs),
                total=round(sum(xs), 2))

def main():
    trades = engine.simulate(STRATEGY)
    if not trades:
        print("no trades"); return
    trades.sort(key=lambda t: t["date"])

    gross = metrics(trades, "R")
    net = metrics(trades, "R_net")

    # OOS split: first 70% of trades by date = train, last 30% = test
    cut = int(len(trades)*0.70)
    train, test = trades[:cut], trades[cut:]

    # per-quarter (regime proxy)
    quarters = {}
    for t in trades:
        quarters.setdefault(t["q"], []).append(t["R_net"])
    by_q = {q: dict(n=len(v), expectancy=expectancy(v)) for q, v in sorted(quarters.items())}
    q_pos = sum(1 for v in by_q.values() if v["expectancy"] > 0)

    # concentration: share of total net-R from the top 3 trades
    tot = sum(t["R_net"] for t in trades)
    top3 = sorted((t["R_net"] for t in trades), reverse=True)[:3]
    top3_share = round(sum(top3)/tot, 3) if tot > 0 else None

    score = dict(
        strategy=STRATEGY,
        goal=dict(beat_R_net_OOS=GOAL_R, min_win=BASELINE_WIN,
                  baseline_R=BASELINE_R, uplift_required=GOAL_UPLIFT),
        full_sample=dict(gross=gross, net=net),
        train=metrics(train, "R_net"),
        test_OOS=metrics(test, "R_net"),
        by_quarter=by_q,
        regimes_positive=f"{q_pos}/{len(by_q)}",
        top3_concentration=top3_share,
        open_trades=sum(1 for t in trades if t["open"]),
        # convenience flags mirroring the rubric (verifier re-checks, does not trust these)
        self_reported=dict(
            net_full=net["expectancy"], net_OOS=metrics(test, "R_net")["expectancy"],
            net_train=metrics(train, "R_net")["expectancy"],
            beats_goal_OOS=metrics(test, "R_net")["expectancy"] >= GOAL_R,
            positive_train_test_full=(metrics(train, "R_net")["expectancy"] > 0
                                      and metrics(test, "R_net")["expectancy"] > 0
                                      and net["expectancy"] > 0),
        ),
        n_total=len(trades),
        ledger_top=sorted(trades, key=lambda t: t["R_net"], reverse=True)[:8],
        ledger_worst=sorted(trades, key=lambda t: t["R_net"])[:5],
    )
    out = _score_out
    json.dump(score, open(out, "w"), indent=2)

    s = STRATEGY
    print(f"\nSTRATEGY: filter={s['filter']} exit={s['exit_model']} "
          f"target_R={s['target_R']} rs_ceiling={s['rs_ceiling']} fx={s['fx_roundtrip_pct']}%")
    print(f"GOAL: net expectancy >= {GOAL_R}R OOS  AND  win >= {BASELINE_WIN}  "
          f"(beat Alex {BASELINE_R}R by {int(GOAL_UPLIFT*100)}%)\n")
    print(f"n={len(trades)} ({score['open_trades']} still open, marked-to-last-close)")
    print(f"FULL  gross {gross['expectancy']:+.3f}R  net {net['expectancy']:+.3f}R  "
          f"win {net['win']*100:.0f}%  totalNet {net['total']:+.1f}R")
    print(f"TRAIN net {score['train']['expectancy']:+.3f}R (n={score['train']['n']})   "
          f"TEST/OOS net {score['test_OOS']['expectancy']:+.3f}R (n={score['test_OOS']['n']})")
    print(f"regimes positive: {score['regimes_positive']} quarters   "
          f"top-3 concentration: {top3_share}")
    print("\nby quarter (net R):")
    for q, v in by_q.items():
        print(f"  {q}: {v['expectancy']:+.3f}R  (n={v['n']})")
    print(f"\nscore.json written -> {out}")

if __name__ == "__main__":
    main()
