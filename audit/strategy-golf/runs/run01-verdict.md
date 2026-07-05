# Strategy Golf — Run 01 verdict (full ~19-month history)

**Strategy:** filter=medium (Alex's own 3 rules) · exit=runner (trail 21EMA-low) · fx=1.5% single round trip
**Decisive question:** does the runner-exit positive-skew edge (+0.60R on the last quarter) survive multiple regimes out-of-sample?

## Backtest score (engine.py + backtest.py)
- n=90 (7 still open, marked-to-last-close)
- FULL: gross +1.759R · net +1.179R · win 36% · total +106.1R
- TRAIN net +1.188R (n=62) · TEST/OOS net +1.159R (n=28)
- regimes positive: **3 / 7 quarters** · top-3 concentration **1.019**
- by quarter (net R): 24Q4 −3.70 · 25Q1 −1.86 · **25Q2 +14.30** · 25Q3 +4.81 · 25Q4 −0.64 · 26Q1 −0.98 · 26Q2 +1.11
- top trades: HOOD +67.7 · ORCL +21.2 · SNOW +19.2 · SPOT +17.9 · ARM +10.7

## Independent verifier verdict: **FAIL / FRAGILE**
- Hard fails: criterion 2 (n=90 < 150) and criterion 7 (top-3 concentration 1.019 >> 0.60).
- Refutation: strip the top 3 trades → full expectancy collapses to **−0.02R** (below zero, below baseline). Strip HOOD alone → +0.43R. Only 3 of 7 quarters carry it; 2025Q2 alone (+100R contribution, 96% from 3 names) exceeds total net profit. OOS "pass" leans on one ORCL trade + 7 favorably-marked open positions.
- **Conclusion: the runner edge is ~3 trades wide. Tail-luck in two AI-mania quarters, not a deployable, regime-stable edge.** This confirms the caveat in learnings-alex.md rather than overturning it.

## Next experiment named by the verifier
Winsorize per-trade R at a deployable ceiling (+5R/+10R), freeze the 7 open trades at last close (no favorable marking), then leave-one-quarter-out CV. Prediction: capping the tail collapses expectancy toward the ex-top-3 −0.02R, settling that the goal is unmeetable with this signal.
