# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Copy workspace config
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY web/package.json ./web/
# app/ needed for workspace resolution even though we don't build it
COPY app/package.json ./app/

# Install dependencies
RUN npm ci

# Copy source code
COPY shared/ ./shared/
COPY web/ ./web/

# Build shared library first
RUN npm run build -w shared

# Build web (client + server bundles)
ARG VERSION=dev
ENV VERSION=${VERSION}
RUN npm run build -w web

# Stage 2: Production
FROM node:20-slim

WORKDIR /app

# Install tsx for running TypeScript in production
RUN npm install -g tsx

# Copy package files for production deps only
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY web/package.json ./web/
COPY app/package.json ./app/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built artifacts from builder
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/web/dist ./web/dist

# Copy server.ts for tsx to run
COPY web/server.ts ./web/

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose SSR server port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Run the SSR server with tsx
CMD ["tsx", "web/server.ts"]
