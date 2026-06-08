#!/bin/bash
# Alphabet Growth Agents — Background Runner
# Usage:
#   ./run.sh          Run in background, log to data/logs/
#   ./run.sh --fg     Run in foreground (see output live)
#   ./run.sh --status Check if running
#   ./run.sh --stop   Stop the background process
#   ./run.sh --logs   Tail the latest log

DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$DIR/data/logs"
PID_FILE="$DIR/data/agent.pid"
mkdir -p "$LOG_DIR"

NODE=$(which node)
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
LOG_FILE="$LOG_DIR/run_${TIMESTAMP}.log"

case "${1:-}" in
  --fg)
    echo "Running in foreground..."
    cd "$DIR" && "$NODE" src/index.js
    ;;

  --status)
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "Running (PID $(cat "$PID_FILE"))"
      echo "Latest log: $(ls -t "$LOG_DIR"/run_*.log 2>/dev/null | head -1)"
    else
      echo "Not running"
      rm -f "$PID_FILE"
    fi
    ;;

  --stop)
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      kill "$(cat "$PID_FILE")"
      rm -f "$PID_FILE"
      echo "Stopped"
    else
      echo "Not running"
      rm -f "$PID_FILE"
    fi
    ;;

  --logs)
    LATEST=$(ls -t "$LOG_DIR"/run_*.log 2>/dev/null | head -1)
    if [ -n "$LATEST" ]; then
      tail -f "$LATEST"
    else
      echo "No logs found"
    fi
    ;;

  *)
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "Already running (PID $(cat "$PID_FILE")). Use ./run.sh --stop first."
      exit 1
    fi

    echo "Starting in background..."
    echo "Log: $LOG_FILE"

    cd "$DIR" && nohup "$NODE" src/index.js > "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    echo "PID: $(cat "$PID_FILE")"
    echo ""
    echo "Commands:"
    echo "  ./run.sh --status   Check if running"
    echo "  ./run.sh --logs     Follow the log output"
    echo "  ./run.sh --stop     Stop the process"
    ;;
esac
