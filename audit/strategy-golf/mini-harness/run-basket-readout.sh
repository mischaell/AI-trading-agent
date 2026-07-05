#!/bin/zsh
# Weekly momentum-basket readout (Mac Mini, launchd). Computes the live MCO regime
# state + top-25 basket and Telegrams it. Reuses the forward-test's off-Dropbox code,
# bar cache, and Telegram creds.
set -euo pipefail
FT="$HOME/mission-control/alex-forward-test"
CODE="$FT/code"
STATE_DIR="$HOME/mission-control/momentum-basket"
LOG="$STATE_DIR/run.log"
export SG_CACHE_DIR="$FT/.barcache"
mkdir -p "$STATE_DIR" "$SG_CACHE_DIR"
[ -f "$FT/.env" ] && source "$FT/.env"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] --- basket readout ---" >>"$LOG"
OUT="$(python3 "$CODE/basket_readout.py" 2>>"$LOG")"
echo "$OUT" >>"$LOG"
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ] && [ -n "$OUT" ]; then
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=$OUT" >>"$LOG" 2>&1 && echo "[$(date '+%H:%M:%S')] sent" >>"$LOG"
else
  echo "[$(date '+%H:%M:%S')] no creds or empty output — logged only" >>"$LOG"
fi
