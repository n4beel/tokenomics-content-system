# Single-stage — simpler and more reliable on Railway
FROM node:20-slim

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

# Verify the build produced output
RUN test -f dist/main.js || (echo "Build failed: dist/main.js not found" && exit 1)

EXPOSE 3000

# db push applies the schema directly (no migration files needed)
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/main"]
