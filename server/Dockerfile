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

# Run the application
CMD ["uv", "run", "python", "-m", "drawing_agent.main"]
