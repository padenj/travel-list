# Multi-stage Dockerfile that builds the frontend (Vite) and packages the backend server
# into one image so a single published image can run both services.

FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies for build (full install ensures tsx is available)
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Copy repo and build the PWA frontend
COPY . .
RUN npm run build:pwa
  
# Compile server TypeScript to runnable JS for production
RUN npx tsc -p tsconfig.node.json --outDir server-dist

# Final image: include the built frontend and the server code
FROM node:22-alpine AS final
WORKDIR /app

# Copy built frontend into a path the server will serve from

# Copy built frontend
COPY --from=builder /app/dist ./frontend/dist

# Copy compiled server JS and package files
COPY --from=builder /app/server-dist ./server-dist
COPY package.json package-lock.json* ./

# Install runtime dependencies only (no dev deps)
RUN npm ci --production --no-audit --no-fund

# Copy entrypoint that runs migrations on startup
COPY docker/backend-entrypoint.sh /usr/local/bin/backend-entrypoint.sh
RUN chmod +x /usr/local/bin/backend-entrypoint.sh

EXPOSE 3000

# Start migrations via entrypoint, then start the backend which will serve both API
# and static frontend on the same port (3000). This avoids running a separate
# nginx process and eliminates nginx config errors.
ENTRYPOINT ["/usr/local/bin/backend-entrypoint.sh"]
# Run compiled server JS with node on PORT 3000
CMD ["/bin/sh", "-c", "PORT=3000 node server-dist/index.js"]

# Note:
# - Backend listens on port 3000 (server/index.ts default override via PORT env)
# - Frontend is served from ./frontend/dist by the server when present
