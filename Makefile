.PHONY: install dev dev-web dev-stop server server-bg server-logs server-stop server-restart app web test test-e2e test-e2e-sdk test-record-fixture test-replay lint format typecheck clean cli cli-turn cli-status build-shared e2e e2e-install

# Install all dependencies
install:
	cd server && uv sync
	npm install --legacy-peer-deps

# Run server + Expo app (foreground, Ctrl+C to stop)
dev:
	@./scripts/dev.sh

# Run server only (foreground)
server:
	cd server && uv run python -m code_monet.main

# Run server in background with logging (for Claude debugging)
server-bg:
	@mkdir -p server/logs
	@if curl -s localhost:8000/debug/agent > /dev/null 2>&1; then \
		echo "Server already running"; \
	else \
		cd server && nohup uv run python -m code_monet.main > logs/server.log 2>&1 & \
		sleep 2; \
		if curl -s localhost:8000/debug/agent > /dev/null 2>&1; then \
			pgrep -f "code_monet.main" | head -1 > server/logs/server.pid; \
			echo "Server started (PID $$(cat server/logs/server.pid)). Logs: server/logs/server.log"; \
		else \
			echo "Server failed to start. Check server/logs/server.log"; \
		fi; \
	fi

# Tail server logs
server-logs:
	@tail -f server/logs/server.log

# Stop server
server-stop:
	@PID=$$(pgrep -f "code_monet.main" | head -1); \
	if [ -n "$$PID" ]; then \
		kill $$PID 2>/dev/null; \
		sleep 1; \
		echo "Server stopped (PID $$PID)"; \
	else \
		echo "Server not running"; \
	fi; \
	rm -f server/logs/server.pid

# Restart server (background mode)
server-restart: server-stop
	@sleep 1
	@$(MAKE) server-bg

# CLI commands for testing agent
cli:
	cd server && uv run python -m code_monet.cli --help

cli-turn:
	cd server && uv run python -m code_monet.cli run-turn

cli-status:
	cd server && uv run python -m code_monet.cli status

# Run app only
app:
	cd app && npm start

# Run web dev server only
web:
	cd web && npm run dev

# Run server + Vite web app (foreground, Ctrl+C to stop)
dev-web:
	@./scripts/dev-web.sh

# Kill any stuck dev servers by port
dev-stop:
	@./scripts/kill-dev.sh

# Run all tests
test: test-server test-app

test-server:
	cd server && uv run pytest

test-app:
	cd app && npm run test

# E2E SDK integration tests (API key from SSM or .env)
test-e2e-sdk:
	cd server && uv run pytest tests/test_e2e_sdk.py -v

# Record WebSocket message fixtures (requires API key)
test-record-fixture:
	cd server && uv run pytest tests/test_e2e_websocket_recording.py -v -k "test_record"

# Run app reducer replay tests (fast, no API)
test-replay:
	npm run test -w app -- --testPathPattern=reducer.replay

# Run all integration/E2E tests (excluding Maestro iOS simulator tests)
test-e2e: test-e2e-sdk test-replay

# Run tests with coverage
coverage:
	cd server && uv run pytest --cov=drawing_agent --cov-report=html
	cd app && npm run test --coverage

# E2E tests (iOS simulator via Maestro)
e2e:
	@./scripts/e2e.sh

e2e-install:
	@echo "Installing Maestro..."
	@curl -Ls "https://get.maestro.mobile.dev" | bash
	@echo "Add ~/.maestro/bin to your PATH if not already done"

# Build shared library
build-shared:
	cd shared && npm run build

# Lint all code
lint: lint-server lint-app lint-shared lint-web

lint-server:
	cd server && uv run ruff check .

lint-app:
	cd app && npm run lint

lint-shared:
	cd shared && npm run lint

lint-web:
	cd web && npm run lint

# Format all code
format: format-server format-js

format-server:
	cd server && uv run ruff format .

format-js:
	npm run format

# Check formatting without writing
format-check: format-check-server format-check-js

format-check-server:
	cd server && uv run ruff format --check .

format-check-js:
	npm run format:check

# Type checking
typecheck: typecheck-server typecheck-app typecheck-shared typecheck-web

typecheck-server:
	cd server && uv run python -m mypy code_monet

typecheck-app:
	cd app && npm run typecheck

typecheck-shared:
	cd shared && npm run typecheck

typecheck-web:
	cd web && npm run typecheck

# Clean build artifacts
clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "node_modules" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".expo" -exec rm -rf {} + 2>/dev/null || true
	rm -rf server/.ruff_cache 2>/dev/null || true
	rm -rf app/coverage 2>/dev/null || true
	rm -rf shared/dist 2>/dev/null || true
