/**
 * Root agent for the Tokenomics.net Content System.
 *
 * Carl is a SequentialAgent that orchestrates the weekly content pipeline:
 * Riley (research) → Maya (plan) → LoopAgent(Quill + MayaQA, max 3 iterations)
 *
 * Data flows between agents via outputKey in session state:
 * - Riley → research_brief
 * - Maya → content_plan
 * - Quill → drafts
 * - MayaQA → qa_result
 *
 * Usage:
 *   npx adk web          # Interactive testing UI
 *   npx adk run agent.ts # CLI testing
 *   npx adk api_server . # Production API server
 */
import { SequentialAgent, LoopAgent } from '@google/adk';
import { ensureModelRegistry } from './agents/register-models.js';

// Register custom model connectors once at startup.
ensureModelRegistry();

import { createRileyAgent } from './agents/riley.js';
const rileyAgent = createRileyAgent();
import { mayaAgent } from './agents/maya.js';
import { quillAgent } from './agents/quill.js';
import { mayaQaAgent } from './agents/maya-qa.js';

/**
 * QA Loop: Quill writes → MayaQA reviews
 * Repeats up to 3 times until all posts pass QA.
 * MayaQA signals completion by including "ALL_PASSED" in output.
 */
const qaLoop = new LoopAgent({
  name: 'QALoop',
  subAgents: [quillAgent, mayaQaAgent],
  maxIterations: 3,
});

/**
 * Carl: The orchestrator.
 * Runs the full weekly content pipeline in sequence.
 */
export const rootAgent = new SequentialAgent({
  name: 'Carl',
  description:
    'Carl orchestrates the weekly content pipeline: research → planning → writing → QA review.',
  subAgents: [rileyAgent, mayaAgent, qaLoop],
});
