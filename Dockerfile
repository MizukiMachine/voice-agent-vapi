# ============================================================
# Voice Engine Studio - Dockerfile for Cloud Run
# OpenAI Realtime API Direct Integration
# ============================================================

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# No native dependencies needed (Python/ONNX removed in Issue #26)

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for next.config.ts build)
RUN npm ci

# Copy application files
COPY . .

# Copy .env file (contains only NEXT_PUBLIC_* variables - safe to bake into image)
COPY .env ./

# Build Next.js application
# .env contains unencrypted client-side variables (NEXT_PUBLIC_*)
# Server-side secrets are injected at runtime from Secret Manager
RUN npm run build:plain

# ============================================================
# Production stage
# ============================================================
FROM node:20-alpine AS runtime

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Copy built application from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Set permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

# Expose port (Cloud Run sets PORT env var)
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:$PORT/api/health || exit 1

# Start Next.js server
CMD ["node", "server.js"]
