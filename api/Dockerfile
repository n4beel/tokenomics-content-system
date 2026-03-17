# Single-stage — simpler and more reliable on Railway
FROM node:20-slim

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps (including devDeps needed for nest build)
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source and build
COPY . .
RUN npm run build

# Verify the build produced output (rootDir=src → dist/main.js)
RUN test -f dist/main.js || test -f dist/src/main.js || (echo "Build failed: no main.js found in dist/" && exit 1)

EXPOSE 3000

# db push applies the schema directly (no migration files needed)
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node $(test -f dist/main.js && echo dist/main.js || echo dist/src/main.js)"]
