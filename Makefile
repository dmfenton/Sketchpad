.PHONY: install dev server app test lint format typecheck clean

# Install all dependencies
install:
	cd server && uv sync
	cd app && pnpm install

# Run both server and app
dev:
	@echo "Starting server and app..."
	@make -j2 server app

# Run server only
server:
	cd server && uv run python -m drawing_agent.main

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
