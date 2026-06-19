#!/bin/bash
# ===========================================
# CHATBOT - Auto-restart wrapper v2
# ===========================================
# This script keeps the backend running even if it crashes or
# receives SIGTERM from the hosting environment.
#
# Usage:
#   source ~/nodevenv/YOUR_DOMAIN/20/bin/activate
#   nohup bash keep-alive.sh > /dev/null 2>&1 &
#   disown
#
# To stop permanently:
#   touch /path/to/whatsapp-chatbot/.stop-backend
#   kill $(cat /path/to/whatsapp-chatbot/.backend.pid 2>/dev/null)
#
# ===========================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

STOP_FILE="$SCRIPT_DIR/.stop-backend"
PID_FILE="$SCRIPT_DIR/.backend.pid"
LOG_FILE="$SCRIPT_DIR/server.log"
KEEPER_PID_FILE="$SCRIPT_DIR/.keeper.pid"

# Store own PID so it can be killed externally
echo $$ > "$KEEPER_PID_FILE"

# Remove any leftover stop file
rm -f "$STOP_FILE"

# Detect Node path (CloudLinux nodevenv)
NODE_BIN="${NODE_BIN_PATH:-$(which node 2>/dev/null)}"
if [ ! -f "$NODE_BIN" ]; then
  NODE_BIN="$(which node 2>/dev/null)"
fi

if [ -z "$NODE_BIN" ] || [ ! -f "$NODE_BIN" ]; then
  echo "[KEEP-ALIVE] ERROR: Node.js not found" >> "$LOG_FILE"
  exit 1
fi

echo "[KEEP-ALIVE] Started at $(date)" >> "$LOG_FILE"
echo "[KEEP-ALIVE] Node: $NODE_BIN (v2)" >> "$LOG_FILE"
echo "[KEEP-ALIVE] Wrapper PID: $$" >> "$LOG_FILE"

# Trap SIGTERM/SIGINT/SIGHUP on the WRAPPER itself — ignore them so only the child dies
# The wrapper will detect the child exited and restart it
# NOTE: SIGKILL cannot be trapped — if CloudLinux sends SIGKILL, the crontab watchdog will revive us
trap '' SIGTERM SIGINT SIGHUP

RESTART_COUNT=0
MAX_RAPID_RESTARTS=10
RAPID_RESTART_WINDOW=60
LAST_START_TIME=0

while true; do
  # Check for stop file
  if [ -f "$STOP_FILE" ]; then
    echo "[KEEP-ALIVE] Stop file detected, shutting down gracefully..." >> "$LOG_FILE"
    rm -f "$STOP_FILE"
    if [ -f "$PID_FILE" ]; then
      BACKEND_PID=$(cat "$PID_FILE")
      kill "$BACKEND_PID" 2>/dev/null
      wait "$BACKEND_PID" 2>/dev/null
    fi
    rm -f "$PID_FILE" "$KEEPER_PID_FILE"
    echo "[KEEP-ALIVE] Stopped at $(date)" >> "$LOG_FILE"
    exit 0
  fi

  # Track rapid restarts — wait 120s instead of stopping permanently
  CURRENT_TIME=$(date +%s)
  if [ $((CURRENT_TIME - LAST_START_TIME)) -lt $RAPID_RESTART_WINDOW ]; then
    RESTART_COUNT=$((RESTART_COUNT + 1))
    if [ $RESTART_COUNT -ge $MAX_RAPID_RESTARTS ]; then
      echo "[KEEP-ALIVE] Too many rapid restarts ($RESTART_COUNT in ${RAPID_RESTART_WINDOW}s). Waiting 120s..." >> "$LOG_FILE"
      sleep 120
      RESTART_COUNT=0
    fi
  else
    RESTART_COUNT=0
  fi
  LAST_START_TIME=$CURRENT_TIME

  # Kill zombie processes on port 3001 before starting (prevents EADDRINUSE)
  ZOMBIE_PID=$(lsof -t -i:3001 2>/dev/null)
  if [ -n "$ZOMBIE_PID" ]; then
    echo "[KEEP-ALIVE] Killing zombie process on port 3001 (PID: $ZOMBIE_PID)" >> "$LOG_FILE"
    kill "$ZOMBIE_PID" 2>/dev/null
    sleep 2
    kill -9 "$ZOMBIE_PID" 2>/dev/null
    sleep 1
  fi

  echo "[KEEP-ALIVE] Starting backend... (restart #$RESTART_COUNT) at $(date)" >> "$LOG_FILE"

  # Start the backend
  "$NODE_BIN" server.js >> "$LOG_FILE" 2>&1 &
  BACKEND_PID=$!
  echo $BACKEND_PID > "$PID_FILE"

  echo "[KEEP-ALIVE] Backend started with PID $BACKEND_PID" >> "$LOG_FILE"

  # Wait for the backend to exit
  wait $BACKEND_PID 2>/dev/null
  EXIT_CODE=$?

  echo "[KEEP-ALIVE] Backend exited with code $EXIT_CODE at $(date)" >> "$LOG_FILE"

  # Clean up PID file
  rm -f "$PID_FILE"

  # Check for stop file again before restarting
  if [ -f "$STOP_FILE" ]; then
    echo "[KEEP-ALIVE] Stop file detected after exit, not restarting." >> "$LOG_FILE"
    rm -f "$STOP_FILE" "$KEEPER_PID_FILE"
    exit 0
  fi

  # Wait before restarting (exponential backoff for rapid failures)
  if [ $RESTART_COUNT -gt 3 ]; then
    WAIT_TIME=$((RESTART_COUNT * 5))
    echo "[KEEP-ALIVE] Waiting ${WAIT_TIME}s before restart (rapid failure backoff)..." >> "$LOG_FILE"
    sleep $WAIT_TIME
  else
    echo "[KEEP-ALIVE] Restarting in 5 seconds..." >> "$LOG_FILE"
    sleep 5
  fi
done
