#!/usr/bin/env bash
# Start the turn labeler detached, tailnet-only, with a pidfile.
#   ./run.sh [port] [host]
set -euo pipefail
PORT="${1:-8842}"
# Host: argument 2, else $TURN_LABELER_HOST, else the untracked local env file
# (TURN_LABELER_HOST=<tailnet-ip>), else loopback. Never 0.0.0.0.
LOCAL_ENV="${XDG_CONFIG_HOME:-$HOME/.config}/pi-turn-classify/labeler.env"
if [ -z "${TURN_LABELER_HOST:-}" ] && [ -f "$LOCAL_ENV" ]; then
  # shellcheck disable=SC1090
  . "$LOCAL_ENV"
fi
HOST="${2:-${TURN_LABELER_HOST:-127.0.0.1}}"
DATA="${TURN_LABELER_DATA:-$HOME/.local/share/pi-turn-classify-labeler}"
mkdir -p "$DATA"
cd "$(dirname "$0")/../.."
if [ -f /tmp/pi-turn-labeler.pid ] && kill -0 "$(cat /tmp/pi-turn-labeler.pid)" 2>/dev/null; then
  echo "already running (pid $(cat /tmp/pi-turn-labeler.pid)) — http://$HOST:$PORT"
  exit 0
fi
TURN_LABELER_HOST="$HOST" TURN_LABELER_PORT="$PORT" TURN_LABELER_DATA="$DATA" \
  setsid nohup bun run pi-turn-classify/labeler/server.ts > /tmp/turn-labeler.log 2>&1 < /dev/null &
echo $! > /tmp/pi-turn-labeler.pid
sleep 2
echo "started (pid $(cat /tmp/pi-turn-labeler.pid)) — http://$HOST:$PORT"
tail -2 /tmp/turn-labeler.log
