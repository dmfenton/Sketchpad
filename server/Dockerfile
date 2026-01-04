FROM python:3.11-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy project files
COPY pyproject.toml uv.lock alembic.ini ./
COPY drawing_agent/ drawing_agent/
COPY alembic/ alembic/

# Install dependencies
RUN uv sync --frozen --no-dev

# Expose port
EXPOSE 8000

# Set production mode (disables hot reload, enables graceful shutdown handlers)
ENV DEV_MODE=false

# Run uvicorn directly (no reload in production)
CMD ["uv", "run", "uvicorn", "drawing_agent.main:app", "--host", "0.0.0.0", "--port", "8000"]
