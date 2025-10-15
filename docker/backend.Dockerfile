FROM node:22-alpine AS builder
WORKDIR /app

# Build-time deps
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Copy server source and compile to CommonJS for Node runtime
COPY server ./server
COPY tsconfig.node.json ./tsconfig.node.json
# Emit ESM modules targeting Node 20 so `import.meta` and ESM features are preserved.
# Keep moduleResolution=node to match runtime resolution semantics.
RUN npx tsc -p tsconfig.node.json --outDir server-dist --module node20 --moduleResolution node

FROM node:22-alpine AS final
WORKDIR /app

# Copy compiled server and package files
COPY --from=builder /app/server-dist ./server-dist
COPY package.json package-lock.json* ./

# Install runtime deps only
RUN npm ci --production --no-audit --no-fund

# Copy entrypoint
COPY docker/backend-entrypoint.sh /usr/local/bin/backend-entrypoint.sh
RUN chmod +x /usr/local/bin/backend-entrypoint.sh

ENV NODE_ENV=production

# Backend listens on 3001 internally
EXPOSE 3001

ENTRYPOINT ["/usr/local/bin/backend-entrypoint.sh"]
CMD ["node", "server-dist/server/index.js"]
