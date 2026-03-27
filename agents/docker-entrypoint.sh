#!/bin/bash
set -e

# ── Seed ChromaDB on first boot ──────────────────────────────────────────────
# Copy pre-ingested ChromaDB data from the image into the Railway volume.
# The volume is mounted at /data/chroma at runtime but is empty on first deploy.
# The image ships a pre-seeded copy at /app/data/chroma from the local dev build.

CHROMA_VOLUME="/data/chroma"
CHROMA_SEED="/app/data/chroma"
INGESTED_FLAG="$CHROMA_VOLUME/.ingested"

# Seed only when a deploy explicitly points CHROMA_DATA_DIR to an external volume.
if [ "${CHROMA_DATA_DIR:-}" = "$CHROMA_VOLUME" ]; then
  if [ ! -f "$INGESTED_FLAG" ] && [ -d "$CHROMA_SEED" ]; then
    echo "🔌 First boot — seeding ChromaDB volume from pre-ingested data..."
    cp -r "$CHROMA_SEED"/* "$CHROMA_VOLUME/" 2>/dev/null || true
    touch "$INGESTED_FLAG"
    echo "✅ ChromaDB seeded ($(du -sh $CHROMA_VOLUME | cut -f1))"
  else
    echo "📦 ChromaDB volume already seeded, skipping."
  fi
else
  echo "📦 Using bundled ChromaDB at ${CHROMA_DATA_DIR:-/app/data/chroma}; external volume seeding skipped."
fi

# ── Start persistent ChromaDB HTTP server on Railway ─────────────────────────
# On Railway, ADK's MCPToolset re-spawns chroma-mcp for every tool invocation.
# Each spawn loads Python + chromadb + onnxruntime + ONNX model (~300 MB).
# Running ChromaDB as a persistent HTTP server means:
#   - ONNX embedding model loads ONCE at startup (served server-side)
#   - Each chroma-mcp spawn uses --client-type http (~80 MB, no ONNX)
if [ -n "${RAILWAY_ENVIRONMENT:-}" ]; then
  CHROMA_HTTP_PORT="${CHROMA_HTTP_PORT:-8001}"
  CHROMA_DATA="${CHROMA_DATA_DIR:-/app/data/chroma}"
  echo "🔗 Starting ChromaDB HTTP server on 127.0.0.1:${CHROMA_HTTP_PORT}..."
  chroma run --path "$CHROMA_DATA" --host 127.0.0.1 --port "$CHROMA_HTTP_PORT" &

  echo "⏳ Waiting for ChromaDB HTTP server..."
  for i in $(seq 1 60); do
    if curl -s --max-time 2 "http://127.0.0.1:${CHROMA_HTTP_PORT}/api/v2/heartbeat" > /dev/null 2>&1; then
      echo "✅ ChromaDB HTTP server ready (${i}s)"
      break
    fi
    if [ "$i" -eq 60 ]; then
      echo "⚠️  ChromaDB HTTP server did not respond within 60s, proceeding anyway"
    fi
    sleep 1
  done
fi

# Hand off to the original CMD
exec "$@"
