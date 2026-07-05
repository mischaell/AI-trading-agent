# Strategy Golf — consolidated learnings, 2026-07-03 (updated 07-05)

One day, one thread: Elvis Sun's loss-function-development (LFD) playbook → a
blinded self-correction harness → an autonomous Fable 5 optimization run → four
rounds of human-caught corrections → a deployed, pre-registered live watcher.
Everything below is empirical; scripts and raw results live in this directory.

---

## 1 · What ran

1. Built the LFD harness (`lfd/`): blinded date-split eval (dev = 379 calls
   ≤ 2025-12-31, holdout = 201 calls 2026), `engine_ext.py` extension point,
   lint/probe/budget instruments, one-shot `holdout.sh`.
2. A fresh-context Fable 5 agent ran the loop: 18/40 iterations, ~20/180 min,
   zero fence violations (live watchdog + full transcript audit). Final config
   passed all five dev criteria with margin (+0.254R, win 47%, n=164) —
   **holdout −0.001R. Honest FAIL, killing constraint pre-registered and named.**
3. Post-run analyses, each triggered by a Michael catch: regime decomposition,
   size-as-conviction, campaign reconstruction, ADD-format data recovery,
   uncapped-exit re-tests, confluence scoring, capture-rate audit.
4. Deployed: the Mini forward-test watcher now pulls both call formats, refreshes
   data daily, scores WC/B/C/G live, and Telegrams `Alex:` + tier lines only.

## 2 · Method learnings (LFD / agentic optimization)

- **The blind holdout catches what dev-side discipline cannot.** The agent's
  process was near-perfect — rejected the tail trapdoor, chose a lower-scoring
  robust config over a higher-scoring fragile one — and the edge still
  evaporated OOS. The old harness printed OOS every iteration and would have
  shipped it as a PASS. Blinding is the whole game.
- **Goodhart lives one level up: the loss function encodes a belief about what
  edge looks like.** Our anti-fragility criteria (top-3 concentration ≤ 0.60,
  win ≥ 38%) taught the optimizer to cap winners at 4R. Alex is a tail system;
  the rubric defined his actual edge as the thing to avoid. The optimizer
  converged beautifully on the wrong objective. Write the loss function to match
  the edge's true shape, or the agent will build a system that can't earn it.
- **The exit model inverts verdicts — again.** Third independent confirmation:
  fixed-3R vs scale-out (June), 4R-cap vs uncapped (NBIS: +2.48R vs ~+21.8R on
  the same call), and WC-flag leg-judging (uncapped judge → 2026 FULL +0.76R vs
  +0.49R). Never evaluate a strategy under an exit the trader doesn't use.
- **Instruments beat intentions.** A constraint without a check is a vibe:
  lint/probe/budget scripts in the harness, deterministic guards in production.
  Silent VOID for eval-referencing violations so lint can't become an oracle.
- **Silent staleness is the deadliest infra failure.** The paper watcher ran
  3 weeks scoring every call against a bar cache frozen at deploy date: 46 calls
  seen, 0 positions, no error anywhere. Data freshness needs an instrument that
  fails LOUDLY (refresh_data.py aborts if >⅓ of fetches fail).
- **Check extraction against ground truth, not against itself.** The Long-only
  regex silently missed every ADD-format pyramid call for 5 months; only Alex's
  own "Closed" messages exposed it. A parser that returns plausible results is
  not a parser that returns complete results.
- **Results are fragile to data vintage.** Yahoo revisions alone moved the
  locked config's dev from +0.254R to +0.118R (entry admits changed). Any edge
  that can't survive the data provider adjusting closes was never robust.
- **Pattern-mining discipline:** each candidate needs a mechanism stated first +
  positive in BOTH splits + n ≥ ~20 per split; expect ~1 lucky pass per 6 tests;
  falsifications (fresh-name) are as valuable as passes. Combine by confluence
  SCORE with tiered sizing, never hard-AND (intersection books are noise).
  Everything assembled post-hoc gets pre-registered and graded by live data.
- **Latency is a fidelity parameter, not a convenience.** The backtest assumed
  fills at Alex's posted prices; a same-evening alert can't reproduce them.
  Fix = provisional-fast + final-slow: alert within 15 min with the one
  day-incomplete flag (B) marked provisional, then let the EOD run finalize it
  and send an explicit DEMOTED correction. Corrections are one-directional by
  construction (B can only degrade), so a fast alert is always at-least-that-good.
- **Soft votes beat hard vetoes when the data says so:** score-≥2 calls WITHOUT
  the regime flag outperformed in both splits (n=15 total — rare double
  idiosyncratic confirmation). Check before promoting any filter to a gate.

## 3 · Trading findings (Alex's edge, 611 calls Nov-24..Jul-26)

- **The formula:** curated leaders × asymmetric exits × pilot-sized entries ×
  regime gate as circuit-breaker, in USD. Multiplicative; each layer ≈ worthless
  alone. Entries in isolation ≈ +0.06R/trade. Patience/exits ≈ 80% of the base
  edge; pyramiding +43%; the watchlist (not the trigger) is the stock-selection
  alpha; regime is a survivability lever (DD 5× lower), not a return lever.
- **Regime cannot rescue the bar:** within-CONFIRMED expectancy decayed
  2025→2026 (+0.38..+0.87R → +0.11R in an 82%-CONFIRMED quarter). Q1 blind spot
  (credit/internals) recurred both years, in-gate.
- **Winner-continuation (WC)** — re-entry/add while the prior leg in that name
  is winning — is the ONLY pattern that held its expectancy through 2026
  (+0.45R dev / +0.43R holdout, ~52% win). Loser-chasing legs are negative both
  years. His first entries are breakeven probes.
- **His own behavior signals:** posted size is a NEGATIVE predictor (rho −0.24;
  conviction bucket 2026: −0.29R, 19% win) — matches his confessed over-pressing
  leak. Single-call days good both years; multi-call spray days negative in 2026.
  Fresh-name first calls: falsified (repeat names better).
- **Confluence score (WC+B+C+G, equal weights) is monotone in both splits**
  (dev −0.11→+0.67, holdout −0.58→+2.49 across scores 0-4). Tiers: skip ≤1
  (60% of his calls, clearly negative 2026), HALF at 2, FULL at ≥3
  (2026: n=13-18, ~+0.5-0.76R, ~70% win). Both 6/29 pressed adds (NBIS, ARM)
  scored ≤1 and lost in his own book.
- **CAPTURE-RATE CAVEAT (the honest ceiling):** the tiered book is a singles
  machine, not a monster-catcher. Top-20 behavioral winners: only 11 taken;
  their +1,011R of uncapped R became +24.6R in the capped book (~2.4%).
  Monsters are born unconfirmed (NBIS 4/6 scored 1 → skipped) — loss-avoidance
  and catching-every-campaign-start are structurally opposed. Alex's answer is
  pilots on unconfirmed starts; a third book ("pilot every G-flagged start,
  uncapped exit") is the pre-registerable test. Note: the live paper book
  already tracks his real 2R/5R/runner ladder (no 4R cap), so live execution
  keeps more tail than the backtest book. (SPXS/SQQQ +100R+ rows are R-inflation
  on tiny-stop inverse ETFs — flagged, not real edge.)
- **Statistics:** ~500 trades per split needed to confirm the +0.176R bar at
  80% power; no split here comes close; wider universes dilute rather than
  confirm. Only live time buys significance — hence the forward test.

## 4 · Deployed infrastructure (Mini, commits 50d65d5..164def7)

- `discord_pull.py` v2 regex: `\b(Long|ADD\w*)\s+([\d.]+)%\s+([A-Z]{1,6})\s+@\s+([\d.]+).*?S?SL\s*@\s*([\d.]+)` (+fmt/size_pct).
- `refresh_data.py`: daily bars + N100 breadth + 5-state regime + internals
  tickers (HYG/SHY/XLK/XLP/^VIX); loud failure on >⅓ fetch errors.
- `confluence.py`: live WC/B/C/G; WC legs judged by the UNCAPPED behavioral
  exit; `internals()` = the logged-only X flag (v1 frozen: RISK when ≥2 of
  HYG/SHY<21EMA · VIX>21EMA&≥18 · XLK/XLP<21EMA; causal, never scores).
- **Two-cadence alerting:** `com.michael.alex-intraday` (StartInterval 900s,
  self-gated weekdays 14:25–21:10 UK) polls Discord every 15 min →
  `intraday_check.py` scores new calls immediately (B provisional) → Telegram
  FULL/HALF within ~15 min of Alex's post. The 21:35 EOD run finalizes B,
  sends `TKR | DEMOTED tier->tier | later call(s) same day` corrections,
  paper-ingests via the `candidates_today.json` accumulator, and refreshes all
  data. Alert dedupe shared via `alerted.json`.
- Alerts: `Alex:` header + `TKR | FULL/HALF | ENTRY x | SSL y`; silent below
  score 2; no banner/scorecard (scorecard still logged in run.log, where every
  scored call also carries its X=ok/RISK detail).
- `calls_live.json` seeded with the unified 619-call v2 set; grows each run.
- Local deploy source `mini-harness/` fully synced.
- E2E validated 07-05: weekend gate no-ops; injected INTC 6/26 scored 2 [C+G],
  X=RISK(credit+vix) logged, Telegram delivered in final format (msg 926).
  Note: X read RISK on 2025-03-10 and 2026-02-20 (both Q1 bleed windows) and
  reads RISK (credit+defensive) as of 2026-07-03 — the live jury is out.

## 5 · The pre-registered live experiment (2026H2 grades it)

Frozen as of 2026-07-05 — no further tuning against 2026H1 data:
confluence score (equal weights, WC uncapped-judged) · tiers skip/HALF/FULL ·
15-min intraday alerts with provisional B + EOD DEMOTED corrections ·
single-leg execution · USD cost · his 2R/5R/runner ladder in the paper book ·
internals X flag logged on every call (promotion decision deferred to its live
track record). Open candidates for a SECOND pre-registration (not yet wired):
uncapped-exit book side-by-side; pilot-every-G-start book.
