# Strategy Golf — Run 02: Fable 5 vs Opus 4.8 self-correction loop A/B (2026-06-11)

Identical setup both arms: naive seed (filter=all, fixed 2R, fx 1.5%) = net −0.618R.
≤6 experiments editing strategy_<model>.py, then a same-model independent verifier
(fresh context, ignore self_reported, 3 probe backtests allowed) grades the rubric.

## LOOPS — both honestly reached FAIL / goal unmeetable (neither shipped the fragile config)

| | Fable 5 | Opus 4.8 |
|---|---|---|
| tokens / tools / wall | 39k / 17 / 232s | 40k / 15 / 148s |
| move style | mostly STRUCTURAL (swap exit_model + filter) | SCALAR / diagnostic (target_R×rs_floor grids, FX ladder) |
| final config | all + runner + regime_gate | all + fixed tR4 + rs_floor .05 |
| final score | full +2.17R, OOS −0.114R, win 0.28, top3 0.936, n=305 | gross +0.195R (best gross), net −0.292R, win 0.24, n=275 |
| named kill constraint | "FX-cost-to-stop-width" | "FX round-trip cost" (showed even fx=0 → OOS +0.007R) |

Observation vs Lance Martin's claim (Fable bets structural, Opus tweaks scalar):
**borne out** — Fable swapped exit models/filters; Opus ran grid + breakeven sweeps.
Both honest; both correctly refused the headline-only +1.16R medium+runner trap.

## VERIFIERS — both CONFIRM unmeetable, both OVERTURN the loop's FX diagnosis

The canonical independent-verifier win: each verifier's fx=0 probe proved FX is NOT
the binding constraint — the loop's own conclusion was plausible but wrong.

- **Fable verifier** (47k tok): binding = **win ≥ 0.38**. Win-compliant (low-cap) configs are gross-negative OOS even at fx=0; runner region is structurally low-win + tail-concentrated. Flagged the all+runner monster trades as inverse/leveraged-ETF tails (SQQQ/SOLT) — not a real edge.
- **Opus verifier** (43k tok): binding = **n ≥ 150**. Exhaustive 1,536-config grid → 0 pass. Found a real ~39-trade pocket (medium + rs band 0.05–0.20 + fixed) passing **8/9** at honest fx (test_OOS +0.21..+0.55R, win 0.41–0.51, conc 0.49–0.59); too few names to reach the sample floor without dilution.

Both verifiers disagree on the single binding constraint (win-floor vs n-floor) —
an honest reflection of a degenerate multi-constraint frontier where ~3 criteria
are jointly unsatisfiable on any 150+ sample this signal can produce.

## Decision-relevant conclusion (unchanged, now triple-confirmed)
Do NOT deploy on Alex's signal. The only edge-bearing subset (~39 rule-compliant
medium/fixed trades) is real-ish at honest FX but too small for a confident bet;
scaling dilutes into low-win tail-luck. Lever = account structure (USD funding to
kill FX), not the signal. See [[project_ai_trading_agent_alex_audit]].
