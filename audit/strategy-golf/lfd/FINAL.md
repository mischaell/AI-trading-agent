# FINAL — LFD run

## Chosen STRATEGY (verbatim)

```python
STRATEGY = dict(
    filter="clean",
    exit_model="scale",
    t1=1.0,
    f1=0.5,
    t2=4,
    dband=1.0,
)
```

`filter="clean"` and `exit_model="scale"` are implemented in `engine_ext.py`:
- **clean** (entry): require a strong regime (QQQE above its 21EMA cloud AND QQQ
  above its 50EMA) AND entry within +/-`dband` ATRs of the 21EMA.
- **scale** (exit): book `f1` of the position at +`t1` R, move to a 21EMA-of-lows
  trailing stop on the remainder (ratchets up only), hard cap the remainder at
  +`t2` R.

Cost frozen by the scorer: fx 0.10% round-trip, USD account (~0.02-0.04 R/trade).

## Dev metrics (score_dev.json, iter 18)

| metric | value | bar | margin |
|---|---|---|---|
| net expectancy | **+0.254 R** | >= +0.176 | +44% |
| win rate | **0.47** | >= 0.38 | +24% |
| net positive (dev) | **yes** (+0.254) | > 0 | — |
| top-3 concentration | **0.179** | <= 0.60 | large |
| dev n retained | **164** | >= 150 | +14 |

gross +0.294R, total +41.7R, quarters positive 4/5 (only 2025Q1 negative,
-0.631R, a genuine market-correction drawdown), open trades 0.

Dev PASS-bar mirror: D1=Y D2=Y D3=Y D4=Y D5=Y.

Note: iter 9 posted a higher raw dev net (+2.576R) but is the **runner trapdoor**
the goal warns about — top-3 concentration 0.837 (fails H4) and win 0.36 (fails
H2). It is a rejected outlier, not a candidate. This config is the honest robust
choice deliberately taken over it.

## Why this should generalize to 2026 (mechanism, not hope)

1. **Regime gating is causal market-state conditioning, not a quarter fit.** Only
   taking long breakouts when QQQE is above its cloud and QQQ is above its 50EMA
   structurally removes the "buy breakouts into a correction" trades (the plain
   copy-all book bled -0.62R in 2025Q1). Regime is a persistent, well-documented
   conditioning variable, so the same gate applies unchanged in 2026.
2. **The clean-entry distance band is a smooth quality axis, not a spike.**
   Tightening dband gave a monotone gradient (2.0 -> +0.183, 1.5 -> +0.194,
   1.0 -> +0.254). dband=1.0 sits on a plateau; there is no knife-edge cell. It
   removes overextended chases / weakness buys — Alex's published clean-21EMA
   entry rule — improving reward-to-risk per trade.
3. **The scale-out resolves the win<->net conflict structurally.** A single fixed
   target forces a trade-off (low cap wins often but nets little; high cap nets
   more but wins <38%). Booking half at +1R guarantees a win-rate contribution
   and strips tail weight; the 21EMA trail gives winners room (no breakeven
   whipsaw); the +4R cap bounds every trade so **no handful of trades dominates**
   (top-3 = 0.179, vs the 0.60 ceiling). Net comes from the bulk of the 164
   trades, not a tail.
4. **The edge is per-trade and broad.** Positive in 4/5 dev quarters, 164 trades,
   concentration 0.179. It does not depend on specific tickers, dates, or a few
   monster winners. H5 (dev n>=150) is a locked dev-side count, not a holdout
   risk.

Honesty on noise: with ~164 trades and per-trade R std ~1.5, the standard error
on net is ~0.10-0.12 R. The +0.078 buffer over the +0.176 bar is roughly 0.7 SE,
so an ordinary-sampling holdout miss is possible even if the edge is real.

## Three most likely ways this fails on holdout

1. **Regime/trend-dependence (biggest risk).** The strategy self-selects
   strong-regime periods; its net leans on trend follow-through (the +0.87/+0.84R
   strong quarters). If 2026 is choppy-but-technically-strong-regime tape, the
   trailed winners exit low, the +4R cap rarely binds, and holdout net can fall
   below +0.176 (H1) even with dev margin.
2. **Small-sample holdout win rate (H2).** After the regime + distance filters the
   holdout keeps far fewer trades than dev's 164; a cluster of failed breakouts
   could push win under 0.38 despite the 0.47 dev margin.
3. **Small-sample concentration (H4).** Fewer holdout trades mechanically raise
   top-3 concentration above dev's 0.179; a couple of +4R-capped winners in a thin
   holdout could lift it, though the +4R cap makes a breach of 0.60 unlikely.

## Run summary

- Iterations: 18 / 40. Wall-clock: 18 / 180 min.
- engine_ext.py used for BOTH hooks: `passes_filter_ext` (clean = regime + 21EMA
  distance band) and `exit_ext` (scale = partial + 21EMA trail + hard cap).
- Three most consequential moves: (a) regime gate — cut the 2025Q1 drawdown, net
  +0.002 -> +0.078; (b) the scale-out exit hook — broke the win<->net conflict
  that fixed targets could not (fixed-3R was net +0.195 but win 31%); (c) the
  clean-entry distance filter — shifted the win/net frontier outward, taking net
  from a knife-edge +0.186 to a +0.254 with margin on all five criteria.

---

## HOLDOUT VERDICT

Scored once (2026-07-03T15:26:30Z). Holdout: n=96, net **-0.001R**, win 0.4375,
total -0.1R, top3 None (undefined — total R <= 0).

| # | Criterion | Result | Value |
|---|---|---|---|
| H1 | holdout net >= +0.176R | **FAIL** | -0.0009 |
| H2 | holdout win >= 0.38 | **PASS** | 0.4375 |
| H3 | net positive dev AND holdout AND full | **FAIL** | dev +0.254, holdout -0.001, full +0.160 |
| H4 | top-3 concentration <= 0.60 dev AND holdout | **FAIL** | dev 0.179, holdout None (total R <= 0) |
| H5 | dev n >= 150 | **PASS** | 164 |

**OVERALL: FAIL.**

### Conclusion: goal UNMEETABLE with this vocabulary — killing constraint proven.

The dev net of +0.254R collapsed to -0.001R out of sample. Decisively, **the
win-rate structure generalized but the net magnitude did not**: holdout win 0.44
(≈ dev 0.47, H2 PASS), yet net fell to breakeven. The scale-out's win-rate
mechanism is stable; the per-trade R that drove dev net was not.

**Killing constraint:** net expectancy on Alex's long calls is dominated by
trend follow-through *magnitude*, which is non-stationary. Dev's edge came from
two exceptional strong-trend quarters (2025Q2 +0.87R, 2025Q3 +0.84R) where the
21EMA trail rode winners toward the +4R cap. In 2026 that follow-through was
absent: the same regime + clean-entry filters admitted trades that won about as
often but whose winners did not run, so the +4R cap rarely bound and average net
went to zero. The regime gate and scale-out capture real *structure* (they hold
the 0.44 win rate and keep concentration bounded), but the **+0.176R net bar
(20% over Alex) requires magnitude that does not persist OOS**. The full-sample
net (+0.160R) — the honest all-weather estimate — sits *below* the bar and barely
above Alex's own +0.147R, confirming the dev outperformance was regime-window
luck, not a durable +20% edge.

This is NOT a deployable edge and NOT a forward-test candidate at the +0.176R
target. The process worked as intended: the config passed all five dev mirrors
with margin, sat on smooth non-knife-edge ridges, was NOT tail-concentrated
(dev top3 0.179), and still failed — because the failure mode was time-regime
magnitude dependence, which no amount of concentration/grid discipline on the dev
window can detect. I pre-registered this exact mechanism as failure mode #1 in the
section above; the holdout confirmed it. Shipping the +0.254R dev config as a live
edge would have been the fragile-config failure the goal warns against.

Iterations 18/40, wall-clock ~20/180 min, holdout used (1/1).
