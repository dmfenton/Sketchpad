#!/bin/bash
# Local development log operations
# Usage: ./scripts/logs.sh [command] [args]
#
# Commands:
#   (default)     Recent logs from local server (last 100 lines)
#   errors        Error and warning logs only
#   tail          Follow logs in real-time
#   search TERM   Search logs for a pattern
#   json          View logs in JSON format (set LOG_JSON=true)
#   file          View logs from file (if file logging enabled)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_DIR="$PROJECT_ROOT/server"
LOG_FILE="$SERVER_DIR/data/logs/app.log"
ERROR_LOG="$SERVER_DIR/data/logs/error.log"

command="${1:-recent}"

case "$command" in
    recent|"")
        # Try debug endpoint first, fall back to file
        if curl -s "http://localhost:8000/health" > /dev/null 2>&1; then
            curl -s "http://localhost:8000/debug/logs?lines=100"
        elif [ -f "$LOG_FILE" ]; then
            tail -100 "$LOG_FILE"
        else
            echo "Server not running and no log file found."
            echo "Start the server with: make dev"
            exit 1
        fi
        ;;

    errors)
        if [ -f "$ERROR_LOG" ]; then
            cat "$ERROR_LOG"
        elif curl -s "http://localhost:8000/health" > /dev/null 2>&1; then
            curl -s "http://localhost:8000/debug/logs?lines=200" | grep -E "(ERROR|WARNING|error|warning)" || echo "No errors found"
        else
            echo "No error log file and server not running."
            exit 1
        fi
        ;;

    tail)
        if [ -f "$LOG_FILE" ]; then
            tail -f "$LOG_FILE"
        else
            echo "No log file found. In dev mode, logs go to stdout."
            echo "Use 'make dev' to see live logs in terminal."
            exit 1
        fi
        ;;

    search)
        pattern="${2:-}"
        if [ -z "$pattern" ]; then
            echo "Usage: $0 search PATTERN"
            exit 1
        fi
        if [ -f "$LOG_FILE" ]; then
            grep -i "$pattern" "$LOG_FILE" || echo "No matches found"
        elif curl -s "http://localhost:8000/health" > /dev/null 2>&1; then
            curl -s "http://localhost:8000/debug/logs?lines=500" | grep -i "$pattern" || echo "No matches found"
        else
            echo "Server not running and no log file found."
            exit 1
        fi
        ;;

    json)
        echo "To enable JSON logging in dev, set LOG_JSON=true:"
        echo "  LOG_JSON=true make dev"
        ;;

    file)
        if [ -f "$LOG_FILE" ]; then
            cat "$LOG_FILE"
        else
            echo "No log file found at: $LOG_FILE"
            echo "File logging is only enabled in production mode."
            exit 1
        fi
        ;;

    *)
        echo "Unknown command: $command"
        echo "Usage: $0 [recent|errors|tail|search|json|file]"
        exit 1
        ;;
esac
