.PHONY: install dev server server-bg server-logs server-stop server-restart app test lint format typecheck clean

# Install all dependencies
install:
	cd server && uv sync
	cd app && pnpm install

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
	@pkill -f "python.*drawing_agent" 2>/dev/null || true
	@sleep 1
	@cd server && nohup uv run python -m drawing_agent.main > logs/server.log 2>&1 & echo $$! > logs/server.pid
	@echo "Server started. Logs: server/logs/server.log"

# Tail server logs
server-logs:
	@tail -f server/logs/server.log

# Stop server
server-stop:
	@if [ -f server/logs/server.pid ]; then \
		kill $$(cat server/logs/server.pid) 2>/dev/null || true; \
		rm server/logs/server.pid; \
	fi
	@pkill -f "python.*drawing_agent" 2>/dev/null || true
	@echo "Server stopped"

# Restart server (background mode)
server-restart: server-stop server-bg

# Run app only
app:
	cd app && pnpm start

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

# Lint all code
lint: lint-server lint-app

lint-server:
	cd server && uv run ruff check .

lint-app:
	cd app && pnpm lint

# Format all code
format: format-server format-app

format-server:
	cd server && uv run ruff format .

format-app:
	cd app && pnpm format

# Type checking
typecheck: typecheck-server typecheck-app

typecheck-server:
	cd server && uv run mypy drawing_agent

typecheck-app:
	cd app && pnpm typecheck

# Clean build artifacts
clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "node_modules" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".expo" -exec rm -rf {} + 2>/dev/null || true
	rm -rf server/.ruff_cache 2>/dev/null || true
	rm -rf app/coverage 2>/dev/null || true
