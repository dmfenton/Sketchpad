#!/bin/bash
# Dev server script: Python backend + Expo app
# Usage: ./scripts/dev.sh or make dev
# Ctrl+C cleanly kills both servers

set -e
trap 'kill 0; exit' SIGINT SIGTERM

# Pre-cleanup: kill any existing processes on our ports
lsof -ti:8000 | xargs kill 2>/dev/null || true
lsof -ti:8081 | xargs kill 2>/dev/null || true
sleep 1

echo "Starting Python server on :8000..."
(cd server && uv run python -m drawing_agent.main) &

echo "Starting Expo on :8081..."
(cd app && pnpm start) &

wait
