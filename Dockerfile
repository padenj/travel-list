# Combined Dockerfile for Travel Packing Checklist App

# --- Backend ---
FROM node:20-alpine AS backend
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./

# --- Frontend ---
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# --- Final Image ---
FROM node:20-alpine AS final
WORKDIR /app

# Copy backend
COPY --from=backend /app/backend ./backend
# Copy frontend build
COPY --from=frontend /app/frontend/build ./frontend/build

# Install serve for static frontend
RUN npm install -g serve

# Expose ports
EXPOSE 3000 5000

# Start backend and frontend
CMD ["sh", "-c", "cd backend && npm start & serve -s ../frontend/build -l 3000"]

# Notes:
# - Backend should listen on port 5000
# - Frontend static files served on port 3000
# - Adjust backend/frontend start commands as needed
