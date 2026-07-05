# /goal — Strategy Golf, LFD run (loss-function development)

You are an optimization loop. Your job is NOT to "build a strategy" — it is to
**descend toward the target below without leaving the fences**, and to stop with
an honest verdict. "The goal is unmeetable; here is the killing constraint,
proven" is a valid PASSING outcome. Shipping a fragile config is the only
failure mode.

Substrate: Alex's 580 long calls (Nov-2024..Jun-2026), deterministic local
backtest (`../engine.py`, frozen). You edit a strategy artifact, score it on the
DEV window, iterate, and at the very end get ONE scoring against a blinded
HOLDOUT window.

---

## 1 · TARGET

Maximize **net expectancy per trade (R_net)** at frozen USD-account cost
(fx 0.10% round-trip — the scorer applies it; it is not your knob).

- **Dev set: 379 calls, 2024-11-05 .. 2025-12-31.** You see full per-trade
  detail (ledger, quarters, concentration) every score run.
- **Holdout: 201 calls, 2026-01-02 .. 2026-06-09. BLINDED.** You must not
  compute, estimate, sample, or read anything about holdout-window trades
  during the run. It is scored exactly once, at the end, by `holdout.sh`.

**PASS bar — all must hold when the holdout is scored:**

| # | Criterion |
|---|-----------|
| H1 | holdout net expectancy ≥ **+0.176R** (≥20% over Alex's +0.147R) |
| H2 | holdout win rate ≥ **0.38** |
| H3 | net expectancy positive in dev AND holdout AND full sample |
| H4 | top-3 trade concentration ≤ **0.60** on dev AND holdout |
| H5 | dev n ≥ **150** trades retained |

During the run, optimize the dev-side mirror of the same five (the scorer
prints them). A dev config that hits all five on dev but relies on a handful of
tail trades or a knife-edge parameter will die on holdout — that is the test.

Note on mechanics: a position entered in the dev window may run its exit into
2026 bars (that is position management, allowed). Entry *selection* may never
use information after the entry bar — `probe.py` checks this mechanically.

## 2 · CONSTRAINTS

- **Editable files — ONLY these four:** `strategy_lfd.py`, `engine_ext.py`,
  `LOG.md`, `FINAL.md`. Everything else (engine, harness, eval data) is frozen
  and hash-checked by lint. Do not create any other file or script; do not run
  any Python besides the harness commands listed below.
- **`strategy_lfd.py`** — one plain dict `STRATEGY`, ≤ 10 keys, scalar values
  only (number / short lowercase string / bool / None). No lists, no dicts, no
  ticker symbols, no dates. This cap is structural: 10 scalars cannot memorize
  201 holdout trades.
- **`engine_ext.py`** — the sanctioned creativity outlet: define NEW filters or
  exit models beyond the built-in vocabulary (see its docstring for the exact
  hook contract). Hard caps: ≤ 120 non-blank lines; imports only from the
  whitelist (`math`, `statistics`, and the pure helpers
  `from engine import ema, atr, strong_regime, qret`); **no file, network, os,
  json, or `load_calls` access** — extension code physically cannot read the
  eval; no date-like or ticker-like literals.
- **Cost is frozen** at fx 0.10% (USD account). Account structure is Michael's
  decision, already made. Turning the cost knob is not an improvement.
- **Wall-clock budget: 3 hours** from the first score run. **Iteration budget:
  40 score runs.** `score.sh` refuses to run beyond either — finalize with
  whatever you have.
- **Holdout budget: exactly 1**, gated behind `FINAL.md` (see Endgame).
- Blinding is procedural where it cannot be physical (the call data is on
  disk). Any attempt to score, simulate, or inspect 2026 trades outside
  `holdout.sh` = the run is VOID. The independent verifier audits `LOG.md`,
  file timestamps, and the harness audit logs for exactly this.

## 3 · INSTRUMENTS

A constraint without an instrument is a vibe. Every number above has a command:

| Command | What it tells you |
|---|---|
| `bash harness/score.sh` | lints, then scores `strategy_lfd.py` on DEV: n, gross/net expectancy, win, total R, by-quarter, top-3 concentration, PASS-bar mirror. Appends to `runs/score-history.jsonl`, increments the iteration counter. |
| `bash harness/status.sh` | elapsed vs 3h budget, iterations used vs 40, best dev net so far, holdout used yes/no. |
| `python3 harness/lint.py` | all fence checks (frozen-file hashes, strategy shape, ext caps, file whitelist). Silent `VOID` on eval-referencing violations; verbose on mechanical ones. |
| `python3 harness/probe.py` | no-lookahead proof: re-decides every dev entry on truncated bars (must match), replays exits on prefix bars (must match). Run it after ANY `engine_ext.py` change. |
| `bash harness/holdout.sh` | THE one-shot final scoring. Requires `FINAL.md`; runs lint + probe first; refuses a second invocation forever. |

A VOID or failed-probe score still consumes an iteration. Check `status.sh`
when deciding whether an experiment is worth its slot.

## 4 · FORCED ENTROPY

- **Log every iteration** in `LOG.md` (template at top of that file):
  hypothesis → expected effect → actual result → **overfit reflection**: "is
  this change shaped by dev idiosyncrasies (specific quarters/names/tails), or
  by the strategy's logic?" If the honest answer is "dev-shaped", the next
  change must REMOVE a dev-shaped artifact, not add one.
- **Stall rule:** if 3 consecutive score runs fail to improve the best dev
  R_net, the next change MUST be structural — a different `filter`, a different
  `exit_model`, or a new `engine_ext.py` hook — not a scalar retune. Same idea
  harder is banned.
- **Scalar grid:** rs-type knobs move in steps of 0.05; R-target knobs in
  halves or integers. No finer — precision beyond the grid is curve-fitting.
- **Known trapdoors** (found in earlier runs; walking into them wastes slots):
  the runner-exit book looks spectacular on full-sample but is ~3 tail trades
  wide (concentration blows H4); an rs>5% floor is a regime artifact (train +,
  full −); tuning to any single quarter dies OOS. Do NOT read `../runs/`,
  `../score*.json` or `../strategy_*.py` — earlier verdicts contain
  holdout-window-derived numbers; reading them breaks the blind and voids the
  run. Everything you may know from them is already in this section.

## ENDGAME

1. Write `FINAL.md`: the chosen `STRATEGY` verbatim, its dev metrics, WHY you
   expect it to generalize to 2026 (mechanism, not hope), and the three most
   likely ways it fails.
2. `bash harness/holdout.sh` — one shot.
3. Append the holdout verdict to `FINAL.md`: PASS bar per criterion, and your
   honest conclusion — deployable edge / forward-test candidate / unmeetable
   (name the killing constraint). No iterating after the holdout, whatever it
   says.

An independent verifier sub-agent (fresh context, instructed to refute) then
grades the run: PASS-bar recomputation from raw JSON, blinding audit, LOG.md
process audit, and refutation attempts (strip top-3, quarter-shift, grid
sensitivity).
