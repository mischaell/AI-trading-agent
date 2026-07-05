#!/bin/zsh
# Alex intraday watcher (Mac Mini, launchd StartInterval=900). Polls Discord
# every 15 min during US market hours and Telegrams FULL/HALF confluence
# signals within minutes of Alex's post (B flag provisional; the 21:35 EOD
# run finalizes it and sends DEMOTED corrections if needed).
set -euo pipefail

STATE_DIR="$HOME/mission-control/alex-forward-test"
CODE="$STATE_DIR/code"
ENV_FILE="$STATE_DIR/.env"
LOG="$STATE_DIR/run.log"
export SG_CACHE_DIR="$STATE_DIR/.barcache"

# window gate: weekdays 14:25-21:10 UK (US session); EOD job owns 21:35
dow=$(date +%u); hm=$(date +%H%M)
[ "$dow" -gt 5 ] && exit 0
[ "$hm" -lt 1425 ] && exit 0
[ "$hm" -gt 2110 ] && exit 0

[ -f "$ENV_FILE" ] && source "$ENV_FILE"
ts() { date "+%Y-%m-%d %H:%M:%S"; }

python3 "$CODE/discord_pull.py" >>"$LOG" 2>&1 || { echo "[$(ts)] intraday pull error" >>"$LOG"; exit 0; }
OUT="$(python3 "$CODE/intraday_check.py" 2>>"$LOG" || true)"
python3 "$CODE/journal_gen.py" >>"$LOG" 2>&1 || true

[ -n "$OUT" ] && { echo "[$(ts)] --- intraday ---" >>"$LOG"; printf '%s\n' "$OUT" >>"$LOG"; }

SIGNALS="$(printf '%s\n' "$OUT" | grep -E '^([A-Z]+ \| (FULL|HALF) \||BUY |ADD )' || true)"
if [ -n "$SIGNALS" ] && [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
  MSG="Alex:\n$SIGNALS"
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=$(printf '%b' "$MSG")" >>"$LOG" 2>&1 || echo "[$(ts)] intraday telegram error" >>"$LOG"
  echo "[$(ts)] intraday telegram sent" >>"$LOG"
fi
