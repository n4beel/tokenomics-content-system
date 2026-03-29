import { SequentialAgent, LoopAgent, LLMRegistry } from '@google/adk';
import { KimiLlm } from './agents/kimi-llm.js';

// Register KimiLlm so model strings like "kimi/kimi-k2.5" resolve automatically
LLMRegistry.register(KimiLlm);

import { createRileyAgent } from './agents/riley.js';
const rileyAgent = createRileyAgent();
import { samAgent } from './agents/sam.js';
import { samQaAgent } from './agents/sam-qa.js';

/**
 * QA Loop: Sam writes → SamQA validates
 * Repeats up to 3 times until the post passes all QC checks.
 * SamQA signals completion by including "ALL_PASSED" in output.
 */
const samQaLoop = new LoopAgent({
  name: 'SamQALoop',
  subAgents: [samAgent, samQaAgent],
  maxIterations: 3,
});

/**
 * Sam Pipeline: The blog content generation pipeline.
 * Flow: Riley researches → Sam writes + generates images → SamQA validates (loop)
 */
export const rootAgent = new SequentialAgent({
  name: 'SamBlogPipeline',
  description: 'Orchestrates the blog publishing pipeline: research → write → QA review → publish draft to CMS.',
  subAgents: [rileyAgent, samQaLoop],
});
