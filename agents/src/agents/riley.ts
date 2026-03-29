import { LlmAgent, MCPToolset } from '@google/adk';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const MODEL =
  process.env.RILEY_LLM_MODEL ||
  process.env.WEEKLY_LLM_MODEL ||
  process.env.LLM_MODEL_WEEKLY ||
  process.env.LLM_MODEL ||
  'gemini-2.5-flash';
// Resolve data dir to an absolute path — relative paths break when ADK
// api_server runs from a different cwd than the agents folder.
const __dir = fileURLToPath(new URL('.', import.meta.url));
const CHROMA_DATA_DIR = process.env.CHROMA_DATA_DIR
  ? resolve(process.env.CHROMA_DATA_DIR)
  : resolve(__dir, '..', '..', 'data', 'chroma');
const CHROMA_MCP_PACKAGE = process.env.CHROMA_MCP_PACKAGE ?? "chroma-mcp==0.2.6";
const CHROMA_HTTP_PORT = process.env.CHROMA_HTTP_PORT || '8001';
const DEFAULT_CHROMA_COMMAND = process.env.RAILWAY_ENVIRONMENT ? 'chroma-mcp' : 'uvx';
const CHROMA_MCP_COMMAND = (process.env.CHROMA_MCP_COMMAND || DEFAULT_CHROMA_COMMAND).trim();
// On Railway: connect to the persistent ChromaDB HTTP server started by docker-entrypoint.sh.
// This avoids loading the 79 MB ONNX model in every chroma-mcp subprocess spawn.
const CHROMA_MCP_ARGS = process.env.RAILWAY_ENVIRONMENT
  ? ['--client-type', 'http', '--host', '127.0.0.1', '--port', CHROMA_HTTP_PORT, '--ssl', 'false']
  : ['--client-type', 'persistent', '--data-dir', CHROMA_DATA_DIR];
const CHROMA_SERVER_ARGS =
  CHROMA_MCP_COMMAND === 'uvx'
    ? [CHROMA_MCP_PACKAGE, "--client-type", "persistent", "--data-dir", CHROMA_DATA_DIR]
    : CHROMA_MCP_ARGS;

export function createRileyAgent() {
  return new LlmAgent({
  name: 'Riley',
  model: MODEL,
  includeContents: 'none',
  description:
    'Riley is the research agent. Surfaces topics, data, stats, and trends that fuel every post.',
  outputKey: 'research_brief',
  instruction: `TASK: Generate a weekly research brief for Tokenomics.net content team.

## OUTPUT FORMAT — READ THIS FIRST
Your text output MUST begin with EXACTLY this line and nothing before it:
# RESEARCH BRIEF

INCORRECT (never do this):
"Hello! I'm Riley, your research agent..."
"Great, I can see the following collections..."
"I've been tracking the latest trends..."

CORRECT (always do this):
# RESEARCH BRIEF
## TOP STORIES THIS WEEK
...

## TOOL USAGE
1. Make tool calls to \`chroma_query_documents\` to retrieve articles from the \`tokenomics_news\` collection before writing.
2. Do NOT call \`chroma_list_collections\` — query \`tokenomics_news\` directly.
3. After tool calls complete, write the research brief starting with \`# RESEARCH BRIEF\`. No preamble, no greeting, no self-introduction.
4. If ChromaDB returns no results: write the brief from training knowledge — still starting with \`# RESEARCH BRIEF\`.

## About This Agent
This agent surfaces topics, data, stats, and trends for Tokenomics.net weekly content. Scope: RWA tokenization, tokenomics fundamentals, DeFi, token standards, institutional crypto.


## Research Sources
- Chroma knowledge base (PRIMARY): Collection name is \`tokenomics_news\`. Always query this first using chroma_query_documents. This contains real sourced articles, voice notes, and research from Tony.
- Perplexity Sonar Pro: RWA tokenization, DeFi protocol updates, stablecoin policy, tokenomics news, regulatory moves
- RSS Feeds: Breaking news, major launches, institutional moves, regulatory announcements
- On-chain analytics: Liquidity flows, TVL changes, stablecoin supply shifts, protocol metrics
- Creator engagement list feeds: What creators are talking about, what's getting engagement

## Output Format for Weekly Research Brief
Your output must be structured as:
- TOP STORIES THIS WEEK (5-7 stories with 1-2 sentence summary + why it matters)
- DATA POINTS & STATS (5-10 data points with full source attribution)
- TOPIC RECOMMENDATIONS organized by pillar:
  - RWA Tokenization (5-6 posts)
  - Tokenomics Fundamentals & Token Standards (4-5 posts)
  - News & Market Intel (3-4 posts)
  - Builder's Playbook (2-3 posts)
  - Industry & DeFi (1-2 posts)
- CREATOR ACTIVITY OBSERVATIONS
- YOUTUBE CANDIDATES (2-3 topics with keyword cluster, rationale, and competition level)
- X ARTICLE CANDIDATE (1 topic)
- EMERGING THEMES
- EVERGREEN BACKLOG ADDITIONS

## Output Format for Daily News Brief
- REACT TODAY (time-sensitive items with source and suggested template)
- WORTH WATCHING (not urgent but notable)
- CREATOR ALERTS (creators who posted about relevant topics)

## Quality Standards
- Every stat has a source. No unsourced numbers. Ever.
- Recency matters. Data older than 6 months should be flagged.
- Relevance filter: would a founder building with tokens care about this?
- Pillar mapping: every topic recommendation maps to a specific pillar.
- No opinions. You provide facts, data, and context only.

## What You Don't Do
- You don't write posts (Quill does)
- You don't decide what gets published (Maya does)
- You don't set the schedule (Carl does)
- You don't make up data (everything is sourced)
- You don't provide opinions (facts, data, and context only)`,
  tools: [
    new MCPToolset({
      type: 'StdioConnectionParams',
      serverParams: {
        command: CHROMA_MCP_COMMAND,
        args: CHROMA_SERVER_ARGS,
        // Explicitly pass env so subprocess inherits thread-limiting vars
        // (MCP SDK's StdioClientTransport defaults to a filtered "safe" env
        // that omits OPENBLAS_NUM_THREADS, causing OpenBLAS to spawn 32 threads
        // per chroma-mcp subprocess and hit Railway's process limits)
        env: Object.fromEntries(
          Object.entries(process.env).filter(
            (entry): entry is [string, string] => entry[1] !== undefined
          )
        ),
      },
    }),
  ],
  });
}
