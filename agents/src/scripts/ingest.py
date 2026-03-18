#!/usr/bin/env python3
"""
Ingest Tony's .md brand documents into ChromaDB.

Uses the same PersistentClient + default embedding function as chroma-mcp,
so Riley's queries against collection "tokenomics_news" will find this data.

Usage:
  uv run --with chromadb python ingest.py                          # default dirs
  uv run --with chromadb python ingest.py --docs-dir /path/to/docs # custom docs
  uv run --with chromadb python ingest.py --chroma-dir /data/chroma # Railway volume
"""

import argparse
import glob
import hashlib
import os
import re
import textwrap

import chromadb


# ── Chunking ──────────────────────────────────────────────────────────────────

def chunk_markdown(text: str, source: str, max_chunk: int = 1200) -> list[dict]:
    """
    Split a markdown file into chunks by heading boundaries.
    Each chunk gets metadata: source file, heading path, category.
    """
    # Detect category from path
    category = "general"
    lower = source.lower()
    if "identity" in lower or "persona" in lower or "voice" in lower:
        category = "brand-identity"
    elif "channels" in lower or "linkedin" in lower or "youtube" in lower:
        category = "channel-strategy"
    elif "template" in lower:
        category = "content-template"
    elif "workflow" in lower:
        category = "workflow"
    elif "seo" in lower or "keyword" in lower:
        category = "seo"
    elif "strategy" in lower or "pillar" in lower or "audience" in lower:
        category = "strategy"
    elif "offer" in lower or "data-room" in lower:
        category = "offers"
    elif "agent" in lower:
        category = "agent-spec"
    elif "content" in lower or "sipoc" in lower or "signoff" in lower:
        category = "content-strategy"
    elif "testimonial" in lower:
        category = "testimonials"

    # Remove YAML frontmatter
    text = re.sub(r"^---\n.*?\n---\n?", "", text, count=1, flags=re.DOTALL)

    # Split on headings (##, ###, ####)
    sections = re.split(r"\n(?=#{1,4}\s)", text)

    chunks = []
    for section in sections:
        section = section.strip()
        if not section or len(section) < 30:
            continue

        # Extract heading for metadata
        heading_match = re.match(r"^(#{1,4})\s+(.*)", section)
        heading = heading_match.group(2).strip() if heading_match else "intro"

        # If section is too long, split into sub-chunks by paragraph
        if len(section) > max_chunk:
            paragraphs = section.split("\n\n")
            current = ""
            for para in paragraphs:
                if len(current) + len(para) > max_chunk and current:
                    chunks.append({
                        "text": current.strip(),
                        "source": source,
                        "heading": heading,
                        "category": category,
                    })
                    current = para
                else:
                    current = current + "\n\n" + para if current else para
            if current.strip() and len(current.strip()) >= 30:
                chunks.append({
                    "text": current.strip(),
                    "source": source,
                    "heading": heading,
                    "category": category,
                })
        else:
            chunks.append({
                "text": section,
                "source": source,
                "heading": heading,
                "category": category,
            })

    return chunks


def stable_id(source: str, heading: str, index: int) -> str:
    """Deterministic ID so re-running the script upserts (no duplicates)."""
    raw = f"{source}::{heading}::{index}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Ingest brand docs into ChromaDB")
    parser.add_argument(
        "--docs-dir",
        default=os.path.join(os.path.dirname(__file__), "..", "..", "tokenomics.net"),
        help="Directory containing .md brand docs (default: ../tokenomics.net)",
    )
    parser.add_argument(
        "--chroma-dir",
        default=os.environ.get(
            "CHROMA_DATA_DIR",
            os.path.join(os.path.dirname(__file__), "data", "chroma"),
        ),
        help="ChromaDB persistent data directory (default: ./data/chroma or CHROMA_DATA_DIR)",
    )
    parser.add_argument(
        "--collection",
        default="tokenomics_news",
        help="ChromaDB collection name (default: tokenomics_news)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print chunks without inserting into ChromaDB",
    )
    args = parser.parse_args()

    docs_dir = os.path.abspath(args.docs_dir)
    chroma_dir = os.path.abspath(args.chroma_dir)

    print(f"📂 Docs directory:  {docs_dir}")
    print(f"💾 ChromaDB dir:    {chroma_dir}")
    print(f"📦 Collection:      {args.collection}")
    print()

    # Find all .md files
    md_files = sorted(glob.glob(os.path.join(docs_dir, "**", "*.md"), recursive=True))
    print(f"Found {len(md_files)} markdown files\n")

    if not md_files:
        print("❌ No .md files found. Check --docs-dir path.")
        return

    # Chunk all files
    all_chunks = []
    for filepath in md_files:
        rel_path = os.path.relpath(filepath, docs_dir)
        with open(filepath, "r", encoding="utf-8") as f:
            text = f.read()

        chunks = chunk_markdown(text, rel_path)
        all_chunks.extend(chunks)
        print(f"  {rel_path}: {len(chunks)} chunks")

    print(f"\n📊 Total chunks: {len(all_chunks)}")

    if args.dry_run:
        print("\n── DRY RUN — first 3 chunks ──")
        for c in all_chunks[:3]:
            print(f"\n[{c['source']}] ({c['category']}) {c['heading']}")
            print(textwrap.shorten(c["text"], 200))
        return

    # Connect to ChromaDB
    print(f"\n🔌 Connecting to ChromaDB at {chroma_dir}...")
    os.makedirs(chroma_dir, exist_ok=True)
    client = chromadb.PersistentClient(path=chroma_dir)

    # Get or create collection (default embedding function = all-MiniLM-L6-v2)
    collection = client.get_or_create_collection(
        name=args.collection,
        metadata={"description": "Tokenomics.net brand knowledge base"},
    )

    # Upsert in batches
    batch_size = 50
    total_inserted = 0

    for i in range(0, len(all_chunks), batch_size):
        batch = all_chunks[i : i + batch_size]

        ids = []
        documents = []
        metadatas = []

        for idx, chunk in enumerate(batch):
            chunk_id = stable_id(chunk["source"], chunk["heading"], i + idx)
            ids.append(chunk_id)
            documents.append(chunk["text"])
            metadatas.append({
                "source": chunk["source"],
                "heading": chunk["heading"],
                "category": chunk["category"],
            })

        collection.upsert(ids=ids, documents=documents, metadatas=metadatas)
        total_inserted += len(batch)
        print(f"  Upserted {total_inserted}/{len(all_chunks)} chunks...")

    print(f"\n✅ Done! {total_inserted} chunks ingested into '{args.collection}'")
    print(f"   Collection now has {collection.count()} documents total")

    # Quick sanity check
    results = collection.query(query_texts=["tokenomics brand voice"], n_results=3)
    print("\n── Sanity check: query 'tokenomics brand voice' ──")
    for doc, meta in zip(results["documents"][0], results["metadatas"][0]):
        print(f"  [{meta['source']}] {textwrap.shorten(doc, 120)}")


if __name__ == "__main__":
    main()
