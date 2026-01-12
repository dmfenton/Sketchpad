# Stage 1: Build web app
FROM node:20-slim AS web-builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /build

# Copy package files for all workspaces
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared/package.json shared/
COPY web/package.json web/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY shared/ shared/
COPY web/ web/

# Build shared library then web app
RUN cd shared && pnpm run build
RUN cd web && pnpm run build


# Stage 2: Python server
FROM python:3.11-slim

# Build args for version info
ARG APP_VERSION=dev
ARG APP_COMMIT=unknown
ARG APP_BUILD_TIME=unknown

# Labels for container inspection
LABEL org.opencontainers.image.version="${APP_VERSION}"
LABEL org.opencontainers.image.revision="${APP_COMMIT}"
LABEL org.opencontainers.image.created="${APP_BUILD_TIME}"
LABEL org.opencontainers.image.title="drawing-agent"
LABEL org.opencontainers.image.description="Code Monet - Autonomous AI artist"

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy project files
COPY server/pyproject.toml server/uv.lock server/alembic.ini ./
COPY server/drawing_agent/ drawing_agent/
COPY server/alembic/ alembic/

# Copy built web app from builder stage
COPY --from=web-builder /build/web/dist ./web/dist

# Install dependencies
RUN uv sync --frozen --no-dev

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
CMD ["uv", "run", "uvicorn", "drawing_agent.main:app", "--host", "0.0.0.0", "--port", "8000"]
