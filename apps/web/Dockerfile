# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm@9

# NEXT_PUBLIC_API_URL is baked into the client bundle at build time
# Set to the public-facing URL so the browser can reach the API via nginx
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Copy package files for dependency installation
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/config/package.json ./packages/config/

RUN pnpm install --frozen-lockfile

# Copy source files (node_modules excluded via .dockerignore)
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
COPY packages/config ./packages/config

RUN pnpm --filter @youdo/web build

# Production stage
FROM node:20-alpine AS production
WORKDIR /app

RUN npm install -g pnpm@9

# Copy package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/config/package.json ./packages/config/

# Install production dependencies (next binary needed for `next start`)
RUN pnpm install --frozen-lockfile --prod

# Copy compiled output from builder (no node_modules — pnpm installed fresh above)
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/next.config.mjs ./apps/web/next.config.mjs

WORKDIR /app/apps/web

EXPOSE 3000

CMD ["pnpm", "start"]
