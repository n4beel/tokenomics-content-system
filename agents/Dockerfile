# syntax=docker/dockerfile:1
# Node 20 + Python (for uvx/chroma-mcp via uv)
FROM node:20-slim

# Install Python, curl, then uv (which provides uvx)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python-is-python3 curl \
    && ln -sf /usr/bin/python3 /python \
    && python3 -m pip install --no-cache-dir --break-system-packages "chroma-mcp==0.2.6" \
    && curl -LsSf https://astral.sh/uv/install.sh | sh \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Add uv/uvx to PATH
ENV PATH="/root/.local/bin:$PATH"
ENV UV_PYTHON=/usr/bin/python3
ENV OPENBLAS_NUM_THREADS=1
ENV OMP_NUM_THREADS=1
ENV MKL_NUM_THREADS=1
ENV NUMEXPR_NUM_THREADS=1
ENV TOKENIZERS_PARALLELISM=false

WORKDIR /app

# Pre-warm uvx chroma-mcp environment (used on local / non-Railway path)
RUN uvx "chroma-mcp==0.2.6" --help > /dev/null 2>&1 || true
# Pre-download ONNX embedding model into image so chroma_query_documents
# doesn't download 79 MB from S3 at runtime on every container start
RUN python3 -c "\
from chromadb.utils.embedding_functions import DefaultEmbeddingFunction; \
ef = DefaultEmbeddingFunction(); \
ef(['warmup']); \
print('ONNX model pre-cached')"

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
