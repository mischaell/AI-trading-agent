#!/bin/zsh
set -euo pipefail
# Test the one_book alert path end-to-end: injects real historical candidates
# (DELL/MRVL 2026-06-29), runs the book, sends a REAL Telegram. Run on the Mini.
# Used 2026-07-06: DELL bought via A18 (msg 933), MRVL correctly rejected.
STATE_DIR="$HOME/mission-control/alex-forward-test"
CODE="$STATE_DIR/code"
ENV_FILE="$STATE_DIR/.env"
LOG="$STATE_DIR/run.log"
export SG_CACHE_DIR="$STATE_DIR/.barcache"
[ -f "$ENV_FILE" ] && source "$ENV_FILE"

cat > "$STATE_DIR/candidates_today.json" <<'JSON'
[{"id": "t-dell", "ticker": "DELL", "date": "2026-06-29", "entry": 388.05, "sl": 372.99},
 {"id": "t-mrvl", "ticker": "MRVL", "date": "2026-06-29", "entry": 269.94, "sl": 255.92}]
JSON

OUT="$(python3 "$CODE/one_book.py" --run 2>&1)"
printf '%s\n' "$OUT"
printf '%s\n' "$OUT" >>"$LOG"
rm -f "$STATE_DIR/candidates_today.json"

SIGNALS="$(printf '%s\n' "$OUT" | grep -E '^(BUY |ADD |SELL )' || true)"
if [ -n "$SIGNALS" ] && [ -n "${TELEGRAM_BOT_TOKEN:-}" ]; then
  MSG="Alex:\n$SIGNALS"
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=$(printf '%b' "$MSG")" | head -c 100
  echo
fi
