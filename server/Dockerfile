FROM python:3.11-slim

# Build args for version info
ARG APP_VERSION=dev
ARG APP_COMMIT=unknown
ARG APP_BUILD_TIME=unknown

# Labels for container inspection
LABEL org.opencontainers.image.version="${APP_VERSION}"
LABEL org.opencontainers.image.revision="${APP_COMMIT}"
LABEL org.opencontainers.image.created="${APP_BUILD_TIME}"
LABEL org.opencontainers.image.title="code-monet"
LABEL org.opencontainers.image.description="Code Monet - Autonomous AI artist"

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy project files
COPY pyproject.toml uv.lock alembic.ini ./
COPY code_monet/ code_monet/
COPY alembic/ alembic/

# Install dependencies
RUN uv sync --frozen --no-dev

# Create logs directory for structured logging
RUN mkdir -p /app/data/logs

# Create non-root user for security (reduces blast radius of container escape)
RUN useradd --create-home --uid 1000 appuser \
    && chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8000

# Set production mode and version info as env vars
ENV DEV_MODE=false
ENV APP_VERSION=${APP_VERSION}
ENV APP_COMMIT=${APP_COMMIT}
ENV APP_BUILD_TIME=${APP_BUILD_TIME}

# Run uvicorn directly (no reload in production)
CMD ["uv", "run", "uvicorn", "code_monet.main:app", "--host", "0.0.0.0", "--port", "8000"]
