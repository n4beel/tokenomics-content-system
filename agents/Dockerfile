# syntax=docker/dockerfile:1
# Node 20 + Python (for uvx/chroma-mcp via uv)
FROM node:20-slim

# Install Python, curl, then uv (which provides uvx)
RUN apt-get update && apt-get install -y \
    python3 python3-pip curl \
    && curl -LsSf https://astral.sh/uv/install.sh | sh \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Add uv/uvx to PATH
ENV PATH="/root/.local/bin:$PATH"

WORKDIR /app

# Pre-warm chroma-mcp into the uv cache so first run is fast
RUN uvx chroma-mcp --help > /dev/null 2>&1 || true

COPY package*.json ./
RUN npm ci

COPY . .

# ChromaDB persistent data — mount a Railway volume here
RUN mkdir -p /data/chroma
ENV CHROMA_DATA_DIR=/data/chroma

EXPOSE 8000

CMD ["npm", "run", "start"]
