"""strategy.py — the SINGLE artifact the self-correction loop edits.

This is Strategy Golf's `train_gpt.py`. Each loop iteration mutates this dict,
re-runs backtest.py, reads score.json, and decides the next change. Keep it a
plain dict of fully-specified rules: no discretion, no lookahead.

Decision variables:
  filter      : 'all' | 'medium'   medium = liquid-leader + clean-21EMA + strong-regime (Alex's own 3 rules)
  exit_model  : 'fixed' | 'runner' fixed=cap at target_R; runner=trail 21EMA-low, exit on close below
  target_R    : R multiple cap when exit_model == 'fixed'
  regime_gate : require strong regime at entry (ignored if filter already enforces it)
  rs_floor    : min 20d relative-strength vs QQQ (None = off)
  rs_ceiling  : max 20d RS — caps extended chases (the open hypothesis from learnings-alex.md)
  fx_roundtrip_pct : single-leg FX cost as % of position; cost_R = fx% / stop%
"""

STRATEGY = dict(
    filter="medium",        # Alex's own rule-compliant subset
    exit_model="runner",    # the model his rulebook actually prescribes (trim+run)
    target_R=3,             # only used if exit_model == 'fixed'
    regime_gate=False,      # 'medium' already enforces strong regime
    rs_floor=None,
    rs_ceiling=None,        # candidate next experiment: cap extended names
    fx_roundtrip_pct=1.5,   # your single clean round trip (~0.75% each way)
)
