#!/bin/bash
# status.sh — where am I against every budget? (read-only, costs nothing)
set -euo pipefail
LFD="$(cd "$(dirname "$0")/.." && pwd)"
cd "$LFD"

python3 - <<'EOF'
import json, os, time
if not os.path.exists(".run_state.json"):
    print("run not started (no score run yet)"); raise SystemExit
st = json.load(open(".run_state.json"))
el = int(time.time()) - st["started_at"]
print(f"wall-clock : {el//60} / 180 min   ({max(0, 10800-el)//60} min left)")
print(f"iterations : {st['runs']} / 40")
print(f"holdout    : {'CONSUMED' if os.path.exists('.holdout_used') else 'available (1)'}")
hist = [json.loads(l) for l in open("runs/score-history.jsonl")] if os.path.exists("runs/score-history.jsonl") else []
if hist:
    best = max(hist, key=lambda r: r["net"])
    last3 = [r["net"] for r in hist[-3:]]
    print(f"best dev   : {best['net']:+.3f}R (iter {best['iter']}, win {best['win']:.2f}, n {best['n']}, top3 {best['top3']})")
    print(f"last 3 net : {['%+.3f' % x for x in last3]}")
    if len(hist) >= 3 and all(r["net"] <= best["net"] for r in hist[-3:]) and best["iter"] <= hist[-3]["iter"]:
        print("STALL: 3 runs without a new best — next change MUST be structural (goal.md §4)")
EOF
