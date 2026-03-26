import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { execFile } from 'child_process';
import path from 'path';
import {
  buildToolEnv,
  resolveManagedOutputDir,
  resolveNodeExec,
  resolveSeoRoot,
} from './runtime-paths.js';

const researchParams = z.object({
  topic: z.string().describe('The topic or keyword to research'),
  focus: z.string().optional().describe('Comma-separated focus areas, e.g. "statistics,expert-quotes"'),
  outputDir: z.string().optional().describe('Output directory for the research brief'),
  runId: z.string().optional().describe('Run identifier (e.g. blog-abc12345) used to scope outputs under /runs/<runId>/'),
});

export const researchTool = new FunctionTool({
  name: 'research_topic',
  description: 'Research a topic using Perplexity Sonar via OpenRouter. Returns a structured brief with citations, statistics, expert quotes, and key facts for GEO-optimized blog writing.',
  parameters: researchParams as any,
  execute: async (args: any) => {
    const { topic, focus, outputDir, runId } = args;
    const seoRoot = resolveSeoRoot(['scripts/research-pipeline.mjs']);
    const nodeExec = resolveNodeExec();
    const script = path.join(seoRoot, 'scripts', 'research-pipeline.mjs');
    const safeOutputDir = resolveManagedOutputDir(
      seoRoot,
      outputDir || 'research',
      runId,
    );
    const toolEnv = buildToolEnv(seoRoot);
    const cmdArgs = ['research', topic];
    if (focus) cmdArgs.push('--focus', focus);
    cmdArgs.push('--output', safeOutputDir);

    return new Promise((resolve) => {
      execFile(nodeExec, [script, ...cmdArgs], {
        cwd: seoRoot,
        env: toolEnv,
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
