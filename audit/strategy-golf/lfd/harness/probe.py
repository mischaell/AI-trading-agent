#!/usr/bin/env python3
"""probe.py — mechanical no-lookahead proof for the CURRENT strategy + ext.

1. ENTRY probe: every dev-window call is re-decided on bars truncated at the
   decision bar (bars[:p+1]). Any entry decision that changes when the future
   is removed = lookahead. Runs on ALL dev calls.
2. EXIT probe: for every 10th accepted dev trade, the exit is replayed on
   bars[:exit_i+1] (nothing after the bar it claims to exit on). R and exit_i
   must reproduce exactly. Trades still open are skipped (prefix = full).

Exit 0 = clean, 1 = lookahead detected (score is not trustworthy).
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import score_lfd as S
engine = S.engine

CUTOFF = S.CUTOFF
strat = S.STRATEGY
entry_bad, exit_bad, checked_e, checked_x = [], [], 0, 0
accepted = []

for date, tkr, e, sl in engine.load_calls():
    if date >= CUTOFF: continue
    bars = engine.load(tkr)
    if not bars: continue
    i0 = next((i for i, b in enumerate(bars) if b["date"] >= date), None)
    if i0 is None or i0 < 25: continue
    p = i0 - 1
    e21 = engine.ema([b["close"] for b in bars[:p + 1]], 21)[p]
    a14 = engine.atr(bars, 14, p)
    if e21 is None or a14 in (None, 0): continue
    checked_e += 1
    full = S.decide_entry(strat, bars, p, date, e, e21, a14)[0]
    trunc = S.decide_entry(strat, bars[:p + 1], p, date, e, e21, a14)[0]
    if bool(full) != bool(trunc):
        entry_bad.append((date, tkr))
    if full and e - sl > 0:
        accepted.append((date, tkr, bars, i0, e, sl))

for k, (date, tkr, bars, i0, e, sl) in enumerate(accepted):
    if k % 10: continue
    risk = e - sl
    R, mfe, open_trade, exit_i = S.decide_exit(strat, bars, i0, e, sl, risk)
    if open_trade: continue
    checked_x += 1
    R2, _, open2, exit_i2 = S.decide_exit(strat, bars[:exit_i + 1], i0, e, sl, risk)
    if open2 or round(R2, 6) != round(R, 6) or exit_i2 != exit_i:
        exit_bad.append((date, tkr, R, R2))

print(f"entry probe: {checked_e} decisions re-run truncated, {len(entry_bad)} mismatches")
print(f"exit probe:  {checked_x} exits replayed on prefix, {len(exit_bad)} mismatches")
if entry_bad or exit_bad:
    for d, t in entry_bad[:5]: print(f"  ENTRY LOOKAHEAD {d} {t}")
    for d, t, r1, r2 in exit_bad[:5]: print(f"  EXIT LOOKAHEAD {d} {t} full={r1} prefix={r2}")
    print("probe: LOOKAHEAD DETECTED — fix engine_ext.py before scoring again")
    sys.exit(1)
print("probe: clean")
