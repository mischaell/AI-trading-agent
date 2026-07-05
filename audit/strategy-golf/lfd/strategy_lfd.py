"""strategy_lfd.py — THE editable artifact of the LFD run.

One plain dict, <=10 keys, scalar values only. filter="clean" and
exit_model="scale" are implemented in engine_ext.py (strong-regime + 21EMA
distance-band entry; partial-at-t1 then 21EMA trail capped at t2).
"""

STRATEGY = dict(
    filter="clean",
    exit_model="scale",
    t1=1.0,
    f1=0.5,
    t2=4,
    dband=1.0,
)
