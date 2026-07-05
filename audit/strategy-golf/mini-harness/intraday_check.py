#!/usr/bin/env python3
"""intraday_check.py — 15-min intraday scorer for new Alex calls.

Runs after discord_pull.py in run-intraday.sh. For each brand-new candidate:
score WC/B/C/G (B is PROVISIONAL — 'only call so far today'; the 21:35 EOD run
re-scores B on the full day and emits a DEMOTED line if the tier changed),
log the internals X flag, print the alert line for score >= 2.

Also appends candidates to candidates_today.json so the EOD forward_test run
can paper-ingest them (discord_pull's message-level dedupe means the EOD pull
won't see them again). Alert dedupe lives in alerted.json (shared with EOD).
"""
import json, os, sys

STATE_DIR = os.path.expanduser("~/mission-control/alex-forward-test")
CAND = os.path.join(STATE_DIR, "candidates.json")
ACCUM = os.path.join(STATE_DIR, "candidates_today.json")
ALERTED = os.path.join(STATE_DIR, "alerted.json")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def main():
    cands = json.load(open(CAND)) if os.path.exists(CAND) else []
    if not cands:
        return
    acc = json.load(open(ACCUM)) if os.path.exists(ACCUM) else []
    known = {(c["ticker"], c["date"]) for c in acc}
    for c in cands:
        if (c["ticker"], c["date"]) not in known:
            acc.append(c); known.add((c["ticker"], c["date"]))
    json.dump(acc, open(ACCUM, "w"), indent=2)

    # fresh bars for candidate tickers only (flags need history <= yesterday)
    import refresh_data as rd
    for t in sorted({c["ticker"] for c in cands}):
        p = os.path.join(rd.BARS, t + ".json")
        if rd.stale(p):
            try:
                json.dump(rd.fetch(t), open(p, "w"))
            except Exception as e:
                print(f"intraday: bar fetch {t} FAILED ({e})")

    import confluence
    confluence.append_candidates(cands)
    alerted = json.load(open(ALERTED)) if os.path.exists(ALERTED) else {}
    for c in cands:
        key = f"{c['ticker']}:{c['date']}"
        if key in alerted:
            continue
        tier, flags, score = confluence.tier_for(c)
        xok, xd = confluence.internals(c["date"])
        xs = "ok" if xok else ("NODATA" if xok is None else "RISK")
        print(f"scored {c['ticker']} {c['date']}: {score} [{flags}] X={xs}({xd}) "
              f"(B provisional) fmt={c.get('fmt','?')} size={c.get('size_pct','?')}%")
        if tier:
            print(f"{c['ticker']} | {tier} | ENTRY {c['entry']} | SSL {c['sl']}")
        alerted[key] = dict(ticker=c["ticker"], date=c["date"], tier=tier,
                            flags=flags, score=score)
    json.dump(alerted, open(ALERTED, "w"), indent=2)

if __name__ == "__main__":
    main()
