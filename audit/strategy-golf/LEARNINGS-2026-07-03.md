# Strategy Golf — consolidated learnings, 2026-07-03 (updated 07-06)

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
- **Ground truth = the counterparty's STATED numbers** (his pf-update posts:
  2024 +66.5%, 2025 +90.2%, 2026-May +26.8%). Reconstructions from message
  fragments systematically mislead (mine ran 12–38 points low by omitting
  trims and open positions) and must always be labeled with the diff shown.
  Two trust-breaking incidents (SOLT phantom, the +15.1% table cell) produced
  the standing rules: no number in a comparison cell unless it measures the
  same quantity; bias in the cell, not a footnote; every parameter in a build
  carries provenance (his words / tested / my convention, flagged).
- **Event triggers beat price triggers for adds.** Continuation curve: only
  37% of probes reaching +2 ATR reach +6; 47% from +3. Price-level adds at
  +2 ATR won the trend year but lost the choppy year; adds triggered by HIS
  next call (his read, incl. pullback timing) were the only variant positive
  in both years. ATR earns its keep on stops, not on add timing.
- **Entry-confidence sizing mostly fails:** the confluence buckets that
  ranked the all-calls book do NOT stably rank probe outcomes (mid bucket
  flips sign between years; high bucket n=4–6). The single exception, again:
  winner-continuation — $5k probes on it improved BOTH years (+$0.4k/+$3.1k)
  for ~$300/yr extra FX. His posted size stays a NEGATIVE signal — never
  anchor sizing to it.
- **The first-leg cost is structural:** he enters at 11% of account on day
  one; a probe design rides the first leg (entry → his first add, median
  +3.2 ATR) at a quarter of his size. Catch-up sizing can narrow but never
  close this — it is the price of FX-cheap probes.

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

## 5 · THE BOOK — final live design (v2, 2026-07-06, `mini-harness/one_book.py`)

Provenance: M = Michael's words, T = tested choice he approved, C = flagged convention.

| Rule | Value | Prov. |
|---|---|---|
| Qualify | 2 Alex calls in 90d, or 1 call if core within 18mo (A18) | T |
| Probe | $2,500 at qualifying day's close; **$5,000 if winner-continuation** (his last stated Closed in the name ≤30d was a profit) | M / T |
| Adds | triggered by HIS next call while position in profit; catch-up to **$11k → $19k → $28k** (his measured avg first position 11.2% / p75 single 19% / median full build 28%); his add while we're losing: ignored | M |
| Stops/exit | 3×ATR trail below highest close → 2×ATR beyond +6 ATR gain → 1.5× beyond +12 [C]; halved in weak regime; single close exits all; no trims | T / M |
| Sleeve | $100k; when full, **only winner-continuation probes** may open; adds always allowed | M |
| Guards | split-freeze on 40% overnight jumps; entries priced from bars (split-immune) | T |
| Cadence | EOD 21:35 UK; his Trimmed/Closed posts captured live for the WC flag | — |

Backtest reference (stamped, unconstrained sleeve, SIPP costs): 2025 ≈ +$39k,
2026 ≈ +$7.4k, on peak deployment ~$238k. Alex stated benchmark: +90.2% /
+26.8%-May — the gap is his 4–6× exposure and leverage, not the rules.
Superseded on the way here: price-ladder adds, the 2× uniform dial, RS-tier
probes (2025-only benefit), fixed-ATR catch-up rungs (+9 ATR "ridiculous").
Still open (flagged defaults): regime gate on adds, re-arm, exits at size,
entry convention (paper=close, live fill=next open).

**Exit ruling (final, 2026-07-06):** high-R de-risk trims tested against the
trail-tightening (¼ off at +10 ATR; ⅓ off on 3×ATR extension; built positions
only) — an exact substitute, not an improvement: two-year totals equal
(~$56.6k), trims better in grind years (2026 +$1.6k, max giveback $8.6k→$5.6k),
tightening better in break years (2025 +$1.6–3.3k), combining both slightly
worse (double de-risk, second sale only costs upside). Michael ruled: **keep
trail-tightening, no trims.** The general lesson: past a point, exit variants
stop adding money and only choose which year-type pays — the honest frame is
insurance selection, not optimization.

**Mobile journal (2026-07-06):** phone-first paper journal at
`https://michaels-mac-mini.tail1e9dc5.ts.net:8443/` (tailnet-only — the
funneled 443 stays MCP-only). Structure copied from Alex's pf-update view:
Market picture (5-state + MCO/MCSI z + internals as risk on/off), summary
tiles, open-position cards with live trail + distance, closed table, event
feed. Regenerated by `journal_gen.py` after every book run; served by a
launchd `python -m http.server 8787` behind `tailscale serve --https=8443`
(macOS Tailscale can't path-serve files — sandbox). Every Telegram alert
carries the journal link. Gotchas hit: missing `<meta charset="utf-8">` +
no charset header from http.server = mojibake (fixed, verified by headless
screenshot); the remote MCP fetcher refuses tailnet URLs by design — visual
checks run via the local headless-fetch skill on the Mini itself.

**Prime-report pillars (2026-07-06):** the journal's primary market picture is
now Alex's own nightly 5-pillar checklist from the prime-report channel —
`prime_pull.py` parses his verbatim verdicts (QQQE / Breadth / Internals /
Liquid Leaders / Portfolio, each risk-on green, risk-off red, anything else
amber). Ground-truth-first discipline applied to the UI itself: his stated
reads on top, our computed state/internals demoted to a labeled "Our sensors"
line. Immediate payoff: the two disagreed on day one (his internals risk-on
7/1 vs our X-flag risk-off) — the live adjudication the logged-only X flag
was built for, now visible on one card. Book state was also reset by Michael
to mirror his single real holding (SNOW, 21 sh @ 238.54, $5k cost).

## 6 · The pre-registered live experiment (2026H2 grades it)

Frozen as of 2026-07-05 — no further tuning against 2026H1 data:
confluence score (equal weights, WC uncapped-judged) · tiers skip/HALF/FULL ·
15-min intraday alerts with provisional B + EOD DEMOTED corrections ·
single-leg execution · USD cost · his 2R/5R/runner ladder in the paper book ·
internals X flag logged on every call (promotion decision deferred to its live
track record). Open candidates for a SECOND pre-registration (not yet wired):
uncapped-exit book side-by-side; pilot-every-G-start book.
