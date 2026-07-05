#!/bin/zsh
# Deploy the Alex forward-test on the Mac Mini. Idempotent — re-run to update code.
# Copies the runnable scripts OFF Dropbox (avoids launchd-on-Dropbox FDA), installs
# the launchd agent, seeds the Telegram .env, and does a test kickstart.
set -euo pipefail

REPO="$HOME/Dropbox/AI-projects/AI-trading-agent"
SRC="$REPO/audit/strategy-golf"
STATE_DIR="$HOME/mission-control/alex-forward-test"
CODE="$STATE_DIR/code"
LA="$HOME/Library/LaunchAgents"
LABEL="com.michael.alex-forward-test"

mkdir -p "$CODE" "$STATE_DIR/.barcache" "$LA"

# 1) copy runnable code off Dropbox
cp "$SRC/engine.py" "$SRC/forward_test.py" "$CODE/"
cp "$SRC/mini-harness/discord_pull.py" "$SRC/mini-harness/run-forward-test.sh" "$CODE/"
chmod +x "$CODE/run-forward-test.sh"
echo "copied code -> $CODE"

# 2) Telegram creds: reuse an existing watcher's if present, else write a template
if [ ! -f "$STATE_DIR/.env" ]; then
  if [ -f "$HOME/mission-control/price-watcher/.env" ]; then
    grep -E 'TELEGRAM_(BOT_TOKEN|CHAT_ID)' "$HOME/mission-control/price-watcher/.env" > "$STATE_DIR/.env" || true
    echo "seeded .env from price-watcher"
  fi
  if [ ! -s "$STATE_DIR/.env" ]; then
    printf 'TELEGRAM_BOT_TOKEN=\nTELEGRAM_CHAT_ID=\n' > "$STATE_DIR/.env"
    echo "WROTE TEMPLATE $STATE_DIR/.env — fill in TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID"
  fi
  chmod 600 "$STATE_DIR/.env"
fi

# 3) install launchd agent (expand $HOME in the plist into the real path)
sed "s|\$HOME|$HOME|g" "$SRC/mini-harness/$LABEL.plist" > "$LA/$LABEL.plist"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$LA/$LABEL.plist"
launchctl enable "gui/$(id -u)/$LABEL"
echo "launchd agent installed: $LABEL"

# 4) test fire now
echo "kickstarting a test run..."
launchctl kickstart -k "gui/$(id -u)/$LABEL"
sleep 6
echo "--- tail run.log ---"; tail -n 20 "$STATE_DIR/run.log" 2>/dev/null || echo "(no log yet)"
echo
echo "DONE. Schedule: weekdays 21:35 UK. State: $STATE_DIR/state.json  Log: $STATE_DIR/run.log"
echo "If FDA is needed (python3 can't fetch/cache), grant Full Disk Access to /usr/bin/python3 and /bin/zsh."
