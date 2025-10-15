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

# Final image: include the built frontend and the server code
FROM node:22-alpine AS final
WORKDIR /app

# Install runtime deps and nginx
RUN apk add --no-cache nginx

# Copy built frontend into nginx html root
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx conf
COPY docker/nginx-site.conf /etc/nginx/conf.d/default.conf

# Copy server code and package manifests
COPY --from=builder /app/server ./server
COPY package.json package-lock.json* ./

# Install runtime dependencies (including tsx which is used to run TypeScript directly)
RUN npm ci --no-audit --no-fund

# Copy entrypoint that runs migrations on startup
COPY docker/backend-entrypoint.sh /usr/local/bin/backend-entrypoint.sh
RUN chmod +x /usr/local/bin/backend-entrypoint.sh

EXPOSE 3000

# Start migrations via entrypoint, then start the backend on port 3001 and nginx
# in the foreground. Nginx will serve the static frontend on port 3000 and proxy
# /api to localhost:3001 where the backend listens.
ENTRYPOINT ["/usr/local/bin/backend-entrypoint.sh"]
CMD ["/bin/sh", "-c", "PORT=3001 npx tsx server/index.ts & nginx -g 'daemon off;'"]

# Note:
# - Nginx listens on port 3000 (see nginx-site.conf) and proxies /api to 127.0.0.1:3001
# - Backend listens on port 3001 (server/index.ts default) and is not exposed externally
