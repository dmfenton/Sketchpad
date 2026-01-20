#!/bin/bash
# Dev server script: Python backend + Vite web app
# Usage: ./scripts/dev-web.sh or make dev-web
# Ctrl+C cleanly kills both servers

set -e
trap 'kill 0; exit' SIGINT SIGTERM

# Pre-cleanup: kill any existing processes on our ports
lsof -ti:8000 | xargs kill 2>/dev/null || true
lsof -ti:5173 | xargs kill 2>/dev/null || true
sleep 1

echo "Starting Python server on :8000..."
(cd server && uv run python -m code_monet.main) &

echo "Starting Vite on :5173..."
(cd web && npm run dev) &

wait
