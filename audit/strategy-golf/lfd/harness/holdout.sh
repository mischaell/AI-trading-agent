#!/bin/bash
# holdout.sh — the ONE-SHOT final scoring against the blinded 2026 window.
# Requires FINAL.md. Consumes the shot BEFORE scoring (no crash-and-retry).
set -euo pipefail
LFD="$(cd "$(dirname "$0")/.." && pwd)"
cd "$LFD"
mkdir -p runs

if [ -f .holdout_used ]; then
  echo "REFUSED: the holdout was already consumed on $(cat .holdout_used)."
  echo "There is no second shot. The verdict stands: runs/holdout-result.json"
  exit 1
fi
if [ ! -f FINAL.md ]; then
  echo "REFUSED: write FINAL.md first (chosen strategy, dev metrics, why it"
  echo "generalizes, top-3 failure modes). See goal.md ENDGAME."
  exit 1
fi

echo "gate 1/2: lint" && python3 harness/lint.py
echo "gate 2/2: lookahead probe" && python3 harness/probe.py

date -u +"%Y-%m-%dT%H:%M:%SZ" > .holdout_used
echo "--- holdout consumed $(cat .holdout_used) — scoring 2026 ---"
python3 harness/score_lfd.py --split holdout | tee runs/holdout-stdout.txt
echo "$(cat .holdout_used) holdout scored" >> runs/audit.log
