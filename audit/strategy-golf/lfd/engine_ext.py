"""engine_ext.py — sanctioned extension point (the ONLY place for new logic).

Two hooks:

filter == "clean" (passes_filter_ext): Alex's entry quality gate. Require a
strong regime (QQQE above its 21EMA cloud AND QQQ above its 50EMA) and an entry
within +/-dband ATRs of the 21EMA. Buying far above the 21EMA is chasing an
extended move (poor reward-to-risk, prone to snapback); far below is buying
weakness. Clipping both tails raises trade quality — lifting win rate AND net
together — while a wide band keeps n well above the floor (the tight +/-0.5 band
of the built-in "medium" filter over-prunes to ~45).

exit_model == "scale" (exit_ext): scale-out + 21EMA trail. Book fraction f1 at
+t1 R (guarantees a win-rate contribution and strips tail weight), then trail the
remainder's stop up under the 21EMA of lows (below entry early = room, above
entry later = locked gains), with an optional hard cap t2 (R; <=0 = pure trail).
A single fixed target forces a win/net trade-off; the partial + trail breaks it
while the cap + booked partial keep top-3 concentration bounded where a full
21EMA runner (a known trapdoor) blows it out.

Causal: every decision at bar j uses only data up to j (bars[p]/e21/a14 for
entry; bar j's high/low/close and the causal 21EMA-of-lows for exit), so
probe.py's truncated/prefix replay reproduces the decisions exactly.
"""
from engine import ema, strong_regime, qret


def passes_filter_ext(strat, bars, p, date, e, e21, a14):
    t20 = bars[p]["close"] / bars[p - 20]["close"] - 1 if p >= 20 else None
    q20 = qret(bars[p]["date"], 20)
    rs = (t20 - q20) if (t20 is not None and q20 is not None) else -9
    if not strong_regime(date):
        return None, rs
    dband = strat.get("dband", 2.0)
    dist = (e - e21) / a14                       # entry distance to 21EMA in ATRs
    if abs(dist) > dband:
        return None, rs
    return True, rs


def exit_ext(strat, bars, i0, e, sl, risk):
    t1 = strat.get("t1", 1.0)
    f1 = strat.get("f1", 0.5)
    cap = strat.get("t2", 0) or 0
    elow = ema([b["low"] for b in bars], 21)
    p1 = e + t1 * risk
    pc = e + cap * risk                          # hard-cap price (only if cap > 0)
    took = False
    stop = sl
    booked = 0.0
    wt = 1.0
    mfe = 0.0
    for j in range(i0, len(bars)):
        b = bars[j]
        mfe = max(mfe, (b["high"] - e) / risk)
        if not took:
            if b["low"] <= sl:                       # full-size initial stop
                return -1.0, mfe, False, j
            if b["high"] >= p1:                       # book first partial
                booked += f1 * t1
                wt -= f1
                took = True
                if elow[j] is not None and elow[j] > stop:
                    stop = elow[j]                    # seed the trail
                if cap > 0 and b["high"] >= pc:
                    booked += wt * cap
                    return booked, mfe, False, j
                continue
        else:
            if elow[j] is not None and elow[j] > stop:
                stop = elow[j]                        # ratchet trail up only
            if b["close"] < stop:                     # remainder trailed out
                booked += wt * (stop - e) / risk
                return booked, mfe, False, j
            if cap > 0 and b["high"] >= pc:           # remainder hit the cap
                booked += wt * cap
                return booked, mfe, False, j
    last = (bars[-1]["close"] - e) / risk
    if took:
        booked += wt * last
        return booked, mfe, True, len(bars) - 1
    return last, mfe, True, len(bars) - 1
