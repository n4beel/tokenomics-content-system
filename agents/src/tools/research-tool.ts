import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEO_ROOT = path.resolve(__dirname, '../../../../tokenomics-seo');
const SCRIPT = path.join(SEO_ROOT, 'scripts', 'research-pipeline.mjs');

const researchParams = z.object({
  topic: z.string().describe('The topic or keyword to research'),
  focus: z.string().optional().describe('Comma-separated focus areas, e.g. "statistics,expert-quotes"'),
  outputDir: z.string().optional().describe('Output directory for the research brief'),
});

export const researchTool = new FunctionTool({
  name: 'research_topic',
  description: 'Research a topic using Perplexity Sonar via OpenRouter. Returns a structured brief with citations, statistics, expert quotes, and key facts for GEO-optimized blog writing.',
  parameters: researchParams as any,
  execute: async (args: any) => {
    const { topic, focus, outputDir } = args;
    const cmdArgs = ['research', topic];
    if (focus) cmdArgs.push('--focus', focus);
    if (outputDir) cmdArgs.push('--output', outputDir);

    return new Promise((resolve) => {
      execFile('node', [SCRIPT, ...cmdArgs], {
        cwd: SEO_ROOT,
        env: { ...process.env },
        timeout: 120_000,
      }, (error, stdout, stderr) => {
        if (error) {
          resolve(JSON.stringify({ success: false, error: error.message, stderr: stderr?.slice(0, 500) }));
          return;
        }
        resolve(JSON.stringify({ success: true, output: stdout }));
      });
    });
  },
});
