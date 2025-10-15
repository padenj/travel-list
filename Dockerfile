## Multi-stage Dockerfile (slim, production-friendly)

# Stage: client build
FROM node:20-slim AS client-build
WORKDIR /app
COPY client/package.json client/package-lock.json* ./client/
COPY client/ ./client/
RUN cd client \
	&& npm ci --production=false --no-audit --no-fund \
	&& npm run build

# Stage: build server (install dev deps, compile)
FROM node:20-slim AS server-build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY tsconfig.build.json ./
COPY server/ ./server/
RUN npm ci --production=false --no-audit --no-fund \
	&& npm run build:server

# Stage: production runtime (only production deps + built code)
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copy only production dependencies from a fresh npm ci
COPY package.json package-lock.json* ./
RUN npm ci --production --no-audit --no-fund

# Copy built server and client
COPY --from=server-build /app/dist ./dist
COPY --from=client-build /app/client/dist ./client/dist

EXPOSE 3001
CMD ["node", "dist/index.js"]
