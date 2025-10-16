## Multi-stage Dockerfile (slim, production-friendly)

# Stage: client build
FROM node:22-slim AS client-build
WORKDIR /app

# Copy root package metadata and install dependencies (including devDeps) so tools
# like `vite` (declared at the repository root) are available for the client build.
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Copy client source and build using the root-installed tooling. Using
# `npm --prefix client run build` keeps the intent explicit and lets Node
# resolve modules from the parent `node_modules`.
COPY client/ ./client/
RUN npm --prefix client run build

# Stage: build server (install dev deps, compile)
FROM node:22-slim AS server-build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY tsconfig.build.json ./
COPY server/ ./server/
RUN npm ci --production=false --no-audit --no-fund \
	&& npm run build:server

# Stage: production runtime (only production deps + built code)
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ARG VERSION=dev
ARG VCS_REF=unknown
ARG BUILD_DATE=unknown

# Copy only production dependencies from a fresh npm ci
COPY package.json package-lock.json* ./
# Use modern npm flag to omit devDependencies (avoids deprecated warnings)
RUN npm ci --omit=dev --no-audit --no-fund

# Copy built server and client
COPY --from=server-build /app/dist ./dist
COPY --from=client-build /app/client/dist ./client/dist

# Runtime port should be configurable via PORT env var; default to 3000 per release requirements
ENV PORT=3000
EXPOSE ${PORT}

# Write build-info into the image so the running container can report its version.
LABEL org.opencontainers.image.title="travel-list"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.revision="${VCS_REF}"
LABEL org.opencontainers.image.created="${BUILD_DATE}"

RUN printf '{"version":"%s","vcs_ref":"%s","build_date":"%s"}\n' "${VERSION}" "${VCS_REF}" "${BUILD_DATE}" > /app/build-info.json

# Start the server. The server reads process.env.PORT (server/index.ts)
CMD ["node", "dist/index.js"]
