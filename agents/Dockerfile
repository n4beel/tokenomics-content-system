# syntax=docker/dockerfile:1
# Node 20 + Python (for uvx/chroma-mcp via uv)
FROM node:20-slim

# Install Python, curl, then uv (which provides uvx)
RUN apt-get update && apt-get install -y \
    python3 python3-pip python-is-python3 curl \
    && ln -sf /usr/bin/python3 /python \
    && pip3 install --no-cache-dir chroma-mcp \
    && curl -LsSf https://astral.sh/uv/install.sh | sh \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Add uv/uvx to PATH
ENV PATH="/root/.local/bin:$PATH"
ENV UV_PYTHON=/usr/bin/python3

WORKDIR /app

# Pre-warm chroma-mcp into the uv cache so first run is fast
RUN uvx chroma-mcp --help > /dev/null 2>&1 || true

COPY package*.json ./
RUN npm ci

COPY . .

# Make entrypoint executable
RUN chmod +x docker-entrypoint.sh

# Default to in-container Chroma data to avoid paying for an attached volume
# unless explicitly configured with CHROMA_DATA_DIR at deploy time.
ENV CHROMA_DATA_DIR=/app/data/chroma

EXPOSE 8000

# Entrypoint seeds ChromaDB volume on first boot, then runs CMD
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start:prod"]
