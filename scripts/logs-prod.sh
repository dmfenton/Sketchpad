#!/bin/bash
# Production log operations via SSM/CloudWatch
# Usage: ./scripts/logs-prod.sh [command] [args]
#
# Commands:
#   (default)       Recent logs from CloudWatch (last 30 min)
#   errors          Error and warning logs only
#   tail            Tail docker logs on EC2 in real-time
#   search TERM     Search logs for a pattern
#   user USER_ID    Logs for a specific user
#   auth            Authentication-related logs
#   agent           AI agent activity logs
#   ws              WebSocket connection logs

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

command="${1:-recent}"

# Helper to run diagnose.py with uv
diagnose() {
    cd "$PROJECT_ROOT/server" && uv run python "$PROJECT_ROOT/scripts/diagnose.py" "$@"
}

# Helper to run remote.py with uv
remote() {
    cd "$PROJECT_ROOT/server" && uv run python "$PROJECT_ROOT/scripts/remote.py" "$@"
}

case "$command" in
    recent|"")
        diagnose logs 30 --md
        ;;

    errors)
        diagnose logs-errors 60 --md
        ;;

    tail)
        echo "Tailing production logs (Ctrl+C to stop)..."
        remote logs 50
        echo ""
        echo "Note: For continuous tailing, SSH to EC2 and run:"
        echo "  docker logs -f drawing-agent"
        ;;

    search)
        pattern="${2:-}"
        if [ -z "$pattern" ]; then
            echo "Usage: $0 search PATTERN"
            exit 1
        fi
        diagnose logs-search "$pattern" 60 --md
        ;;

    user)
        user_id="${2:-}"
        if [ -z "$user_id" ]; then
            echo "Usage: $0 user USER_ID"
            exit 1
        fi
        diagnose logs-user "$user_id" 60 --md
        ;;

    auth)
        diagnose logs 60 --category auth --md
        ;;

    agent)
        diagnose logs 60 --category agent --md
        ;;

    ws|websocket)
        diagnose logs 60 --category websocket --md
        ;;

    status)
        echo "=== Service Status ==="
        diagnose status --md
        ;;

    *)
        echo "Unknown command: $command"
        echo ""
        echo "Usage: $0 [command] [args]"
        echo ""
        echo "Commands:"
        echo "  recent          Recent logs (default, last 30 min)"
        echo "  errors          Error and warning logs"
        echo "  tail            Recent docker logs"
        echo "  search TERM     Search logs for pattern"
        echo "  user USER_ID    Logs for specific user"
        echo "  auth            Authentication logs"
        echo "  agent           Agent activity logs"
        echo "  ws              WebSocket logs"
        echo "  status          Service health status"
        exit 1
        ;;
esac
