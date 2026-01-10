.PHONY: install dev dev-web server server-bg server-logs server-stop server-restart app web test lint format typecheck clean cli cli-turn cli-status build-shared

# Install all dependencies
install:
	cd server && uv sync
	cd app && pnpm install
	cd shared && npm install
	cd web && npm install

# Run both server and app
dev:
	@echo "Starting server and app..."
	@make -j2 server app

# Run server only (foreground)
server:
	cd server && uv run python -m drawing_agent.main

# Run server in background with logging (for Claude debugging)
server-bg:
	@mkdir -p server/logs
	@if curl -s localhost:8000/debug/agent > /dev/null 2>&1; then \
		echo "Server already running"; \
	else \
		cd server && nohup uv run python -m drawing_agent.main > logs/server.log 2>&1 & \
		sleep 2; \
		if curl -s localhost:8000/debug/agent > /dev/null 2>&1; then \
			pgrep -f "drawing_agent.main" | head -1 > server/logs/server.pid; \
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
	@PID=$$(pgrep -f "drawing_agent.main" | head -1); \
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
	cd server && uv run python -m drawing_agent.cli --help

cli-turn:
	cd server && uv run python -m drawing_agent.cli run-turn

cli-status:
	cd server && uv run python -m drawing_agent.cli status

# Run app only
app:
	cd app && pnpm start

# Run web dev server only
web:
	cd web && npm run dev

# Run server + web dev server (use two terminals instead - more reliable)
# Terminal 1: make server
# Terminal 2: make web
dev-web:
	@echo "Run in two terminals for reliability:"
	@echo "  Terminal 1: make server"
	@echo "  Terminal 2: make web"
	@echo ""
	@echo "Then open http://localhost:5173"

# Run all tests
test: test-server test-app

test-server:
	cd server && uv run pytest

test-app:
	cd app && pnpm test

# Run tests with coverage
coverage:
	cd server && uv run pytest --cov=drawing_agent --cov-report=html
	cd app && pnpm test --coverage

# Build shared library
build-shared:
	cd shared && npm run build

# Lint all code
lint: lint-server lint-app lint-shared lint-web

lint-server:
	cd server && uv run ruff check .

lint-app:
	cd app && pnpm lint

lint-shared:
	cd shared && npm run lint

lint-web:
	cd web && npm run lint

# Format all code
format: format-server format-app format-shared format-web

format-server:
	cd server && uv run ruff format .

format-app:
	cd app && pnpm format

format-shared:
	cd shared && npm run format

format-web:
	cd web && npm run format

# Type checking
typecheck: typecheck-server typecheck-app typecheck-shared typecheck-web

typecheck-server:
	cd server && uv run mypy drawing_agent

typecheck-app:
	cd app && pnpm typecheck

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
