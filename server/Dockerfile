# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Build backend
FROM node:20-alpine AS backend-builder
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ .
RUN npx tsc

# Stage 3: Production
FROM node:20-alpine AS production
WORKDIR /app

# Install production dependencies for server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# Copy built backend
COPY --from=backend-builder /app/server/dist ./dist

# Copy built frontend
COPY --from=frontend-builder /app/dist ./public

# Create data directory for SQLite
RUN mkdir -p data

# Environment
ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_PATH=./data/notebook.db

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["node", "dist/index.js"]
