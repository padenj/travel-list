FROM node:22-alpine
WORKDIR /app

# Copy package manifests and install dependencies (including dev tools like tsx)
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Copy the application server code
COPY server ./server
COPY src ./src
COPY public ./public
COPY server ./server

# Copy entrypoint
COPY docker/backend-entrypoint.sh /usr/local/bin/backend-entrypoint.sh
RUN chmod +x /usr/local/bin/backend-entrypoint.sh

ENV NODE_ENV=production

# Expose the server port
EXPOSE 5000

ENTRYPOINT ["/usr/local/bin/backend-entrypoint.sh"]
CMD ["npx", "tsx", "server/index.ts"]
