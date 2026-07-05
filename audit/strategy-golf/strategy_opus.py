"""SEED strategy (naive) — identical starting point for both model arms.
Naive baseline = copy every long call, fixed 2R cap, real FX cost. The loop must
DISCOVER improvements by editing this dict (filter, exit_model, target_R,
regime_gate, rs_floor, rs_ceiling). No lookahead allowed.
Decision vars documented in strategy.py."""
STRATEGY = dict(
    filter="all",
    exit_model="fixed",
    target_R=4,
    regime_gate=False,
    rs_floor=0.05,
    rs_ceiling=None,
    fx_roundtrip_pct=1.5,
)
