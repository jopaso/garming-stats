#!/bin/sh
set -eu

INTERVAL="${SYNC_INTERVAL_SECONDS:-900}"
SYNC_SCRIPT="/app/fetch/sync.py"
DATA_DIR="/app/public/data"
GARTH_DIR="${HOME:-/home/app}/.garth"
APP_USER="app"

echo "Garmin Stats container starting"
echo "  Sync interval: ${INTERVAL}s"
echo "  Web server: port ${PORT:-8787}"

# Named volumes often mount as root-owned; fix so the app user can write.
mkdir -p "$DATA_DIR" "$GARTH_DIR"
if [ "$(id -u)" = "0" ]; then
  chown -R "$APP_USER:$APP_USER" "$DATA_DIR" "$GARTH_DIR"
  run_as() { runuser -u "$APP_USER" -- "$@"; }
else
  run_as() { "$@"; }
fi

# Immediate status so the UI does not look "empty" with no explanation.
run_as python -c "
from pathlib import Path
import json
from datetime import datetime
p = Path('$DATA_DIR') / 'sync_status.json'
p.parent.mkdir(parents=True, exist_ok=True)
p.write_text(json.dumps({
  'status': 'running',
  'message': 'Contenedor arrancado. Esperando primer sync...',
  'updatedAt': datetime.now().isoformat(),
}), encoding='utf-8')
"

sync_loop() {
  while true; do
    echo "[sync] Starting Garmin sync..."
    if run_as python "$SYNC_SCRIPT"; then
      echo "[sync] Finished OK"
    else
      echo "[sync] Finished with errors (exit $?); will retry after interval"
    fi
    echo "[sync] Sleeping ${INTERVAL}s until next run"
    sleep "$INTERVAL"
  done
}

# Sync in the background; wait starts after each run finishes (no overlap).
sync_loop &
SYNC_PID=$!

cleanup() {
  echo "Stopping sync loop (pid $SYNC_PID)..."
  kill "$SYNC_PID" 2>/dev/null || true
  wait "$SYNC_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

if [ "$(id -u)" = "0" ]; then
  exec runuser -u "$APP_USER" -- python /app/fetch/serve.py
else
  exec python /app/fetch/serve.py
fi
