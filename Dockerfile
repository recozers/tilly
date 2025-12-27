# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/server/package*.json ./packages/server/
COPY packages/client/package*.json ./packages/client/

# Install dependencies
RUN npm ci

# Copy source
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server
COPY packages/client ./packages/client

# Build all packages
RUN npm run build

# Stage 2: Production
FROM node:22-alpine AS production

WORKDIR /app

# Copy built artifacts and production dependencies
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/packages/shared/package*.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/server/package*.json ./packages/server/
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/client/dist ./packages/client/dist

# Install production dependencies only
RUN npm ci --omit=dev

# Set environment
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Start server
CMD ["node", "packages/server/dist/server.js"]
