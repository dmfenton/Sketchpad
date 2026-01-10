#!/bin/bash
# Force-kill stuck dev servers by port
# Usage: ./scripts/kill-dev.sh or make dev-stop

lsof -ti:8000 | xargs kill -9 2>/dev/null && echo "Killed :8000" || echo ":8000 clear"
lsof -ti:8081 | xargs kill -9 2>/dev/null && echo "Killed :8081" || echo ":8081 clear"
lsof -ti:5173 | xargs kill -9 2>/dev/null && echo "Killed :5173" || echo ":5173 clear"
