FROM node:20-alpine
WORKDIR /app

# OpenSSL necessário para o Prisma (engine linux-musl-openssl-3.0.x)
RUN apk add --no-cache openssl

RUN npm install -g pnpm

# Copy package files for dependency installation
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY packages/config/package.json ./packages/config/

# Install all dependencies (tsx and prisma CLI are needed at runtime)
RUN pnpm install --frozen-lockfile

# Copy source files only (node_modules excluded via .dockerignore)
COPY apps/api ./apps/api
COPY packages/db ./packages/db
COPY packages/shared ./packages/shared
COPY packages/config ./packages/config

# Generate Prisma client
RUN pnpm --filter @youdo/db db:generate

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["pnpm", "--filter", "@youdo/api", "start"]
