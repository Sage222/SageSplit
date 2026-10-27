# syntax=docker/dockerfile:1
FROM node:22-slim AS builder

WORKDIR /app

# Copy only package.json and .npmrc (avoiding npm bug #4828 with lockfiles & optional native bindings)
COPY package.json .npmrc* ./
RUN npm install --legacy-peer-deps --include=optional --no-audit --no-fund

# Copy application source and build frontend bundle
COPY . .
RUN npm run build

# Production runtime stage
FROM node:22-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3044
ENV DATA_DIR=/app/data

# Create persistent data directory for ledger & user store
RUN mkdir -p /app/data && chown -R node:node /app

COPY --from=builder --chown=node:node /app/package.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/server.ts ./server.ts
COPY --from=builder --chown=node:node /app/src ./src

USER node
EXPOSE 3044

VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://localhost:3044/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["./node_modules/.bin/tsx", "server.ts"]
