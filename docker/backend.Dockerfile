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

ENV NODE_ENV=production

# Expose the server port
EXPOSE 5000

# Use tsx to run the TypeScript server entrypoint (matches dev tooling)
CMD ["npx", "tsx", "server/index.ts"]
