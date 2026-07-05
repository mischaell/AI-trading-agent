"""strategy_fable_v.py — independent verifier probe (scratch, do not loop-edit).

PROBE 3: gross ceiling of the win-compliant region. T=1.5 is the highest cap
that can plausibly hold win>=0.38; regime_gate keeps quality without gutting n.
FX=0 bounds the best case: if gross OOS < 0.176 here, NO cost level rescues any
win-compliant config, and the kill constraint is signal weakness + FX jointly.
"""

STRATEGY = dict(
    filter="all",
    exit_model="fixed",
    target_R=1.5,
    regime_gate=True,
    rs_floor=None,
    rs_ceiling=None,
    fx_roundtrip_pct=0.0,   # diagnostic ceiling only — cannot pass criterion 8
)
