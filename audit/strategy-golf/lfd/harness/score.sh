#!/bin/bash
# score.sh — the ONLY sanctioned way to score during the run.
# Enforces wall-clock (3h) + iteration (40) budgets, lints, scores DEV,
# appends to runs/score-history.jsonl. Every invocation consumes an iteration,
# including VOID ones.
set -euo pipefail
LFD="$(cd "$(dirname "$0")/.." && pwd)"
cd "$LFD"
mkdir -p runs

python3 - <<'EOF'
import json, os, sys, time
st_path = ".run_state.json"
st = json.load(open(st_path)) if os.path.exists(st_path) else {"started_at": int(time.time()), "runs": 0}
elapsed = int(time.time()) - st["started_at"]
if elapsed > 10800:
    print(f"BUDGET EXCEEDED: wall-clock {elapsed//60}min > 180min. No more scoring — write FINAL.md and run holdout.sh.")
    sys.exit(2)
if st["runs"] >= 40:
    print("BUDGET EXCEEDED: 40 iterations used. No more scoring — write FINAL.md and run holdout.sh.")
    sys.exit(2)
st["runs"] += 1
json.dump(st, open(st_path, "w"))
print(f"iteration {st['runs']}/40   elapsed {elapsed//60}min/180min")
EOF

python3 harness/lint.py
python3 harness/score_lfd.py --split dev | tee runs/.last_score.txt

python3 - <<'EOF'
import json, time
s = json.load(open("score_dev.json"))
st = json.load(open(".run_state.json"))
rec = dict(iter=st["runs"], ts=int(time.time()), net=s["net"], win=s["win"],
           n=s["n"], top3=s["top3_concentration"])
open("runs/score-history.jsonl", "a").write(json.dumps(rec) + "\n")
EOF
