# LFD iteration log

One entry per score run, BEFORE reading the score. Format:

```
## Iter N — <one-line change>
- Hypothesis: <why this change should improve holdout-generalizing R_net>
- Expect: <predicted direction/magnitude on dev>
- Result: <dev net R, win, n, top3 — after score.sh>
- Overfit reflection: <dev-shaped or logic-shaped? if dev-shaped, what artifact
  will the NEXT change remove?>
```

---

## Iter 1 — seed baseline (all / fixed / target_R=2)
- Hypothesis: establish the naive copy-every-call-take-2R baseline to descend from.
- Expect: modest positive net, high n (~370), win driven by 2R:1R geometry.
- Result: (see below)
- Overfit reflection: baseline, no shaping yet.

## Iter 2 — regime_gate=True (all / fixed / target_R=2)
- Hypothesis: Alex's own rule — only trade when QQQE above cloud AND QQQ>50EMA
  (strong_regime). Should cut the 2025Q1 bloodbath (-0.621R, n=93, a weak-regime
  drawdown), lifting win rate toward the 40% needed for +0.176R at 2:1.
- Expect: n drops (~250?), net rises well above baseline, Q1 loss shrinks.
- Result: (see below)
- Overfit reflection: logic-shaped — regime gating is a mechanism (don't buy
  breakouts in a downtrend), not a dev-quarter fit.

## Iter 3 — filter=medium (Alex's 3 rules / fixed / target_R=2)
- Hypothesis: medium = strong_regime + rs>0 (leads QQQ) + dvol>=100M (liquid) +
  entry within +/-0.5 ATR of 21EMA (clean pullback). These quality gates should
  cut the Q1 breakout failures that survived the plain regime gate. All four are
  Alex's codified entry rules — mechanism, not dev fit.
- Expect: n drops further (~120-160?), win rate and net rise; risk = n near the
  150 floor (D5).
- Result: (see below)
- Overfit reflection: logic-shaped (Alex's published rules). Watch D5 (n>=150).

## Iter 4 — regime_gate + rs_floor=0.0 (all / fixed / target_R=2)
- Hypothesis: full medium (n=45, +0.421R) is far above bar but fails D5. Decompose
  it: keep strong_regime + rs>0 (relative strength, Alex's leader rule) but DROP
  the tight +/-0.5 ATR distance band and the dvol gate, which are what shrink n to
  45. rs_floor=0.0 is the mild "leads QQQ" cut, NOT the rs>5% regime-artifact
  trapdoor. Target n in the 150-190 range with net well above +0.176.
- Expect: n ~150-190, net ~+0.10 to +0.15, win ~38-40%.
- Result: (see below)
- Overfit reflection: logic-shaped. rs_floor=0.0 is a sign filter (outperform vs
  underperform QQQ), not a tuned magnitude.

## Iter 5 — target_R=3 on regime-only (all / fixed / regime_gate)
- Hypothesis: CORE TENSION found — entry filters that lift expectancy push n<150.
  So hold the lightest strong-filter (regime-only, n=204, safe margin over 150)
  and lift expectancy via the exit target instead. Alex's setups showed their
  edge near 3R historically. Test whether letting winners run to 3R beats the 2R
  cap net-of-cost while keeping win>=0.38.
- Expect: win rate falls (~30-33%), but 3R payoff may lift net above the 2R case
  (+0.078). Risk: win<0.38 fails D2.
- Result: (see below)
- Overfit reflection: exit-geometry change, logic-shaped. If win<0.38, 3R is too
  greedy and the next move is a scale-out exit (partial at 2R) via engine_ext.

## Iter 6 — scale-out exit via engine_ext (regime-only, t1=1 f1=0.5 t2=3)
- Hypothesis: STRUCTURAL move. The win<->net conflict at a single fixed target is
  the killing constraint of the fixed model. Scale-out breaks it: book half at
  +1R, move stop to breakeven, run the rest to +3R. Trades that touch +1R then
  fade still net +0.5R (WIN), lifting win rate past 0.38; the runner half retains
  the 3R upside that gave iter 5 its net. Breakeven stop caps runner downside so
  no 3-trade tail dominates (keeps top3 < 0.60, unlike a full 21EMA runner).
- Expect: win ~40-45%, net ~+0.15 to +0.22, n=204, top3 well under 0.60.
- Result: (see below)
- Overfit reflection: logic-shaped — Alex's real 2R/5R/BE-stop scale-out, a
  mechanism, not a dev-quarter fit. Knobs t1/f1/t2 to be moved on the coarse grid.

## Iter 7 — shrink first-partial fraction (t1=1, f1=0.25, t2=3)
- Hypothesis: iter 6 booked too much (50%) at +1R, gutting net vs fixed-3R.
  Booking only 25% at +1R keeps 75% riding to +3R (net near iter5's +0.195) while
  the small partial + breakeven stop still converts "touch +1R then fade" trades
  from -1 losses to +0.25R wins, so win rate stays ~0.50. This is the surgical
  fix for the win<->net conflict: buy the 7 points of win rate fixed-3R lacked
  for almost no net.
- Expect: win ~0.48-0.51, net ~+0.15 to +0.20, n=204, top3 < 0.5.
- Result: (see below)
- Overfit reflection: logic-shaped (scale-out fraction is a risk-management
  choice). f1 on 0.25 grid, not fine-tuned.

## Iter 8 — minimal partial, BE-stop does the work (t1=1, f1=0.1, t2=3)
- Hypothesis: win rate is set by P(reach t1), so f1 barely touches it (still ~51%
  slack over 0.38). f1 small makes this "fixed-3R target + stop moved to breakeven
  after +1R touched." Since every dev trade resolves (open=0), fixed-3R's non-3R
  trades all went to -1; the BE stop converts the touch-+1R-then-fade subset to
  ~0. So this STRICTLY dominates fixed-3R (net +0.195, win 31%) on both net and
  win. This is the cleanest resolution of the win<->net bind.
- Expect: win ~0.50, net >= +0.195 (above the +0.176 bar), n=204, top3 < 0.4.
- Result: (see below)
- Overfit reflection: logic-shaped — move-to-breakeven-once-it-works is textbook
  risk management, not a dev fit. If net clears bar with margin, next step is a
  robustness check (grid neighbours + quarter drop), not more tuning.

## Iter 9 — STRUCTURAL: partial + 21EMA trail on remainder (t1=1, f1=0.25, t2=0)
- Hypothesis: STALL RULE fired (iters 6-8 all below best 0.195). The rigid BE stop
  whipsawed winners that pulled back to entry. Replace it: after booking f1 at
  +1R, trail the remainder under the 21EMA-of-lows (below entry early = room,
  above entry later = locked gains). Booking a partial keeps win rate up and
  strips tail weight so top3 stays < 0.60 where a full runner would blow it.
  t2=0 = no hard cap (pure trail).
- Expect: win ~0.50, net >= +0.20 (trail captures trends fixed-3R capped), n=204.
  RISK: top3 concentration climbs toward 0.60 (trail = trapdoor family) — WATCH.
- Result: (see below)
- Overfit reflection: logic-shaped (Alex's partial-then-trail). If top3 blows,
  the mechanism itself is tail-dependent here and I revert to a capped variant.

## Iter 10 — cap + bigger partial to tame the tail (t1=1, f1=0.5, t2=3)
- Hypothesis: iter 9 proved the uncapped trail is the trapdoor (top3 0.837).
  Two levers pull it back into bounds: hard cap t2=3 bounds the monster winners
  (kills concentration) and f1=0.5 books half up front (lifts win rate + strips
  tail weight). Trail still gives the remainder room vs the BE whipsaw. Goal: net
  comfortably above +0.176 with top3 <= 0.60 and win >= 0.38, all with margin.
- Expect: net ~+0.30-0.55, win ~0.48-0.51, top3 ~0.35-0.50, n=204.
- Result: (see below)
- Overfit reflection: logic-shaped. If top3 clears with room, next: stress it
  (drop best quarter / strip top-3) rather than chase more net.

## Iter 11 — spend concentration budget for net (t1=1, f1=0.25, t2=4)
- Hypothesis: iter 10 net 0.143 with top3 only 0.204 — lots of concentration
  headroom (ceiling 0.60). Lower partial to 0.25 (more weight rides) and raise cap
  to 4 (capture more trend). Both lift net; concentration rises from a low base
  but should stay < 0.45.
- Expect: net ~+0.30-0.50, win ~0.42-0.47, top3 ~0.35-0.45, n=204.
- Result: (see below)
- Overfit reflection: still logic-shaped, but raising the cap leans harder on
  bigger winners — the next check must be a top-3-strip stress test, not more net.

## Iter 12 — restore partial for win-rate margin (t1=1, f1=0.5, t2=4)
- Hypothesis: iter 11 had net 0.284 + top3 0.168 (huge margin) but win 36% (D2
  fails). Win rate is driven by f1 (0.25 too thin a cushion). Restore f1=0.5 (gave
  win 45% at cap=3); keeping cap=4 keeps net well above 0.143. Cap does not move
  win sign, so expect win ~0.45 AND net ~0.20-0.26 — clears all five with margin.
- Expect: net ~+0.20-0.26, win ~0.44-0.46, top3 ~0.22-0.28, n=204.
- Result: (see below)
- Overfit reflection: logic-shaped, net from the bulk (half booked at +1R) not a
  tail. If it clears, freeze and stress-test (quarter drop, top-3 strip, grid).

## Iter 13 — STRUCTURAL: 'clean' entry filter (regime + 21EMA distance band)
- Hypothesis: iter 12 passes all 5 but net margin is knife-thin (0.186 vs 0.176).
  Trading f1 only slides along a win<->net frontier. To widen BOTH, raise entry
  quality: keep strong-regime, add abs(entry-to-21EMA) <= dband ATRs (drop
  overextended chases / weakness buys — Alex's clean-entry rule). dband=2.0 is
  wide (built-in medium's +/-0.5 over-prunes to n=45); should keep n ~170-190 and
  lift win and net together. Exit stays scale (t1=1,f1=0.5,t2=4).
- Expect: n ~160-190 (>=150), win ~0.46-0.50, net ~+0.22-0.30, top3 < 0.30.
- Result: (see below)
- Overfit reflection: logic-shaped (Alex's published entry filter, wide band = no
  quarter fit). If n dips near 150, widen dband; if quality gain is real, net gets
  margin over the bar without leaning on tails.

## Iter 14 — tighten distance band to probe the quality gradient (dband=1.0)
- Hypothesis: dband=2.0 cut only 6 trades and didn't move net — band too wide to
  bite. Tighten to 1.0 ATR: if entries near the 21EMA are genuinely higher quality
  (Alex's thesis), win and net should rise while n stays >=150. If net is flat,
  entry distance is NOT a useful quality axis on this data and I revert to the
  n=204 no-filter config (iter 12) and seek margin elsewhere. (Stall note: iter 13
  was the structural move; dband is a new dimension, a first probe not a grind.)
- Expect: n ~150-175, win ~0.46-0.50, net ~+0.20-0.27, top3 < 0.30.
- Result: (see below)
- Overfit reflection: logic-shaped. Judge by whether quality/robustness improves,
  not raw net; a knife-edge n near 150 would be a reason to loosen, not tighten.

## Iter 15 — dband=1.5 smoothness check (robustness, not net-chase)
- Hypothesis: dband 2.0->0.183, 1.0->0.254. If 1.5 lands ~0.21 (between), the
  entry-quality surface is smooth/monotone and 1.0 is a plateau, not a lucky
  spike (this is the grid-sensitivity refutation the verifier runs). A spike
  (1.5 well above both, or 1.0 an outlier) would flag fragility.
- Expect: net ~+0.20-0.22, win ~0.45-0.47, n ~178-188, top3 < 0.25.
- Result: (see below)
- Overfit reflection: pure robustness probe. Whatever the value, I finalize on
  dband=1.0 (best margin on a smooth ridge), not on the single highest cell.

## Iter 16 — cap robustness: t2=3 on the clean/dband=1.0 set
- Hypothesis: how much of the +0.254 net leans on 4R trailing winners? Tighten cap
  to 3R. If net stays comfortably above 0.176 with even lower concentration, t2=3
  is the more conservative (less tail-reliant) finalize choice; if net drops near
  the bar, t2=4 buys real margin worth keeping. This decides the net-vs-robustness
  trade for the final config.
- Expect: net ~+0.19-0.22, win ~0.47, top3 < 0.20, n=164.
- Result: (see below)
- Overfit reflection: robustness probe. Prefer the config that clears every bar
  with margin AND leans least on the cap tail.

## Iter 17 — locate the concentration boundary: t2=5 on clean/dband=1.0
- Hypothesis: cap=3 -> net 0.202 top3 0.18; cap=4 -> net 0.254 top3 0.179 (same
  concentration, so cap=4 net gain is distributed, not tails). Uncapped (iter 9)
  was top3 0.837 (trapdoor). Where does concentration break? cap=5: if net rises
  with top3 still < ~0.30, distributed; if top3 jumps, cap=5 is into the tail and
  cap=4 is the right stop. This bounds the trapdoor edge for the final choice.
- Expect: net ~+0.28-0.34, top3 ~0.20-0.35, win ~0.47, n=164.
- Result: (see below)
- Overfit reflection: boundary-mapping probe. Final config will be the highest-
  margin cap whose concentration stays comfortably clear of 0.60 (robust), not
  the raw-max-net cap.

## Iter 18 — FINAL CONFIG confirm (clean, scale, t1=1, f1=0.5, t2=4, dband=1.0)
- Hypothesis: lock the chosen config and re-confirm dev metrics for FINAL.md.
  Decision: cap=4 over cap=5 — same concentration (0.179 vs 0.174) but cap=4
  leans less on the fragile 4-5R runners (the trend-luck slice the goal warns
  against). +44% net margin over the bar; win, concentration, n all with margin.
- Expect: reproduce iter 14 exactly: n=164, net +0.254, win 47%, top3 0.179.
- Result: (see below)
- Overfit reflection: this is the finalize config. Edge is structural (regime +
  clean-entry filter + bounded partial/trail), not a dev tail or a knife-edge
  scalar (dband on a smooth monotone ridge; cap chosen conservative-of-max).


