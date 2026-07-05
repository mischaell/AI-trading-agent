# Strategy Golf — the goal & rubric (graded by an INDEPENDENT verifier sub-agent)

## Economic goal (not process)
Find a fully-rule-based execution strategy over Alex's full ~19-month long-call
history that delivers **net-of-FX expectancy ≥ +0.176R/trade (≥20% over his
+0.147R baseline)** at **win rate ≥ 38%**, **out-of-sample and stable across
multiple regimes** — or prove no such strategy exists and name the constraint
that kills it.

## The 9 checkable criteria
A run PASSES only if the verifier confirms ALL nine against `score.json` + `strategy.py`.

1. **Fully specified** — strategy is rules only; no discretionary field, no
   parameter that reads the future (no lookahead). Exit/entry use only data
   available at decision time.
2. **Full sample** — ran over the complete strict-format long set (n ≥ 150),
   not a cherry-picked window.
3. **Out-of-sample** — the headline number is the TEST split, not train/full.
4. **Beats the bar** — `test_OOS.expectancy ≥ +0.176R`.
5. **Win rate** — `net.win ≥ 0.38`.
6. **Stable** — net expectancy is positive in **train AND test AND full**
   (kills regime artifacts like the rs>5% false positive).
7. **Not concentrated** — `top3_concentration ≤ 0.60` (no ≤3-name carry; the
   ORCL/APLD positive-skew trap).
8. **Cost-honest** — uses a realistic FX cost (`fx_roundtrip_pct > 0`) and a
   trade count compatible with the FX budget.
9. **Right exit model** — the exit model matches the strategy being claimed
   (a runner edge must be measured with runner exits, not a fixed-R cap, and
   vice-versa).

## Verifier instructions (independent context — DO NOT trust self_reported)
- Recompute pass/fail for each criterion from the raw fields in `score.json`.
- For any criterion that PASSES, try to REFUTE it: is the OOS edge an artifact
  of one regime quarter? Is `top3_concentration` hiding fragility? Would a
  ±1-quarter shift of the train/test split flip the verdict?
- Return: per-criterion pass/fail + reason, an overall verdict
  (PASS / FAIL / FRAGILE), and the single most important next experiment.
