import { SequentialAgent } from '@google/adk';
import { rileyAgent } from './agents/riley.js';
import { samAgent } from './agents/sam.js';

/**
 * Sam Pipeline: Orhcestrates the SEO Blog generation.
 * Flow: Riley researches → Sam writes blogs
 */
export const rootAgent = new SequentialAgent({
  name: 'SamBlogPipeline',
  description: 'Orchestrates the blog publishing pipeline for SEO content.',
  subAgents: [rileyAgent, samAgent], // Riley produces research_brief, Sam consumes it
});
