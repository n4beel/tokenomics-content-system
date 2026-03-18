#!/bin/bash
set -e

# ── Seed ChromaDB on first boot ──────────────────────────────────────────────
# Copy pre-ingested ChromaDB data from the image into the Railway volume.
# The volume is mounted at /data/chroma at runtime but is empty on first deploy.
# The image ships a pre-seeded copy at /app/data/chroma from the local dev build.

CHROMA_VOLUME="/data/chroma"
CHROMA_SEED="/app/data/chroma"
INGESTED_FLAG="$CHROMA_VOLUME/.ingested"

if [ ! -f "$INGESTED_FLAG" ] && [ -d "$CHROMA_SEED" ]; then
  echo "🔌 First boot — seeding ChromaDB volume from pre-ingested data..."
  cp -r "$CHROMA_SEED"/* "$CHROMA_VOLUME/" 2>/dev/null || true
  touch "$INGESTED_FLAG"
  echo "✅ ChromaDB seeded ($(du -sh $CHROMA_VOLUME | cut -f1))"
else
  echo "📦 ChromaDB volume already seeded, skipping."
fi

# Hand off to the original CMD
exec "$@"
