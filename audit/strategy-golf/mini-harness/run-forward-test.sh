#!/bin/zsh
# Alex forward-test daily runner (Mac Mini, launchd). Paper mode.
# 1) pull Alex's new equity-trades Long calls  2) run the validated forward-test core
# 3) Telegram any NEW SIGNAL / TRIM / EXIT lines + the scorecard.
set -euo pipefail

STATE_DIR="$HOME/mission-control/alex-forward-test"
CODE="$STATE_DIR/code"         # off-Dropbox copy of forward_test.py/engine.py/discord_pull.py (no launchd-on-Dropbox FDA)
ENV_FILE="$STATE_DIR/.env"     # holds TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (copy from price-watcher)
LOG="$STATE_DIR/run.log"
export SG_CACHE_DIR="$STATE_DIR/.barcache"   # cache bars OFF Dropbox (EPERM-safe)

mkdir -p "$STATE_DIR" "$SG_CACHE_DIR"
[ -f "$ENV_FILE" ] && source "$ENV_FILE"
ts() { date "+%Y-%m-%d %H:%M:%S"; }
echo "[$(ts)] --- forward-test run ---" >>"$LOG"

# 1) discord pull
python3 "$CODE/discord_pull.py" >>"$LOG" 2>&1 || echo "[$(ts)] pull error" >>"$LOG"

# 1b) refresh bars + 5-state regime (prevents the stale-cache silent-drop failure)
python3 "$CODE/refresh_data.py" >>"$LOG" 2>&1 || echo "[$(ts)] refresh error" >>"$LOG"

# 1c) THE BOOK (one_book): qualification + entries at close + daily advance
BOOK="$(python3 "$CODE/one_book.py" --run 2>>"$LOG" || true)"
python3 "$CODE/prime_pull.py" >>"$LOG" 2>&1 || true
python3 "$CODE/journal_gen.py" >>"$LOG" 2>&1 || true
BOOK2=""
printf '%s\n' "$BOOK" >>"$LOG"

# 2) core: advance open positions + ingest new candidates -> alert text
OUT="$(python3 "$CODE/forward_test.py" --candidates "$STATE_DIR/candidates.json" 2>>"$LOG")"
OUT="$OUT
$BOOK
$BOOK2"
echo "$OUT" >>"$LOG"

# 3) Telegram. Always send the scorecard head; signals/trims/exits if present.
# tier lines (FULL/HALF/DEMOTED) are LOG-ONLY since 2026-07-09; legacy TRIM/EXIT too
SIGNALS="$(printf '%s\n' "$OUT" | grep -E '^(BUY |ADD |SELL )' || true)"
HEAD="$(printf '%s\n' "$OUT" | grep -E '^SCORECARD' || true)"
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
  # Send a message only when there is something actionable, plus a weekly scorecard (Fridays).
  MSG=""
  [ -n "$SIGNALS" ] && MSG="Alex:\n$SIGNALS\n\nJournal: https://michaels-mac-mini.tail1e9dc5.ts.net:8443/"
  if [ -n "$MSG" ]; then
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=$(printf '%b' "$MSG")" >>"$LOG" 2>&1 || echo "[$(ts)] telegram error" >>"$LOG"
    echo "[$(ts)] telegram sent" >>"$LOG"
  else
    echo "[$(ts)] nothing to alert" >>"$LOG"
  fi
else
  echo "[$(ts)] NO telegram creds in $ENV_FILE — logged only" >>"$LOG"
fi
echo "[$(ts)] done" >>"$LOG"
