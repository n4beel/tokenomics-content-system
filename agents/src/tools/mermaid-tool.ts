import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import {
  buildToolEnv,
  resolveManagedOutputDir,
  resolveNodeExec,
  resolveSeoRoot,
} from './runtime-paths.js';

const mermaidParams = z.object({
  mermaidSource: z.string().describe('The Mermaid diagram source code (e.g. flowchart TD, pie chart, etc.)'),
  slug: z.string().describe('The post slug for file naming'),
  diagramName: z.string().describe('Kebab-case diagram name (e.g. token-allocation, revenue-waterfall)'),
  outputDir: z.string().describe('Output directory for the rendered diagram'),
  runId: z.string().optional().describe('Run identifier used to scope outputs under /runs/<runId>/'),
});

export const mermaidTool = new FunctionTool({
  name: 'render_mermaid_diagram',
  description: 'Render a Mermaid diagram (.mmd source) to a branded PNG image. Provide the Mermaid syntax, post slug, diagram name, and output directory. The diagram will be rendered using the Tokenomics.net brand styling.',
  parameters: mermaidParams as any,
  execute: async (args: any) => {
    const { mermaidSource, slug, diagramName, outputDir, runId } = args;
    const seoRoot = resolveSeoRoot(['scripts/mermaid-render.mjs']);
    const safeOutputDir = resolveManagedOutputDir(seoRoot, outputDir, runId);
    const nodeExec = resolveNodeExec();
    const toolEnv = buildToolEnv(seoRoot);
    const script = path.join(seoRoot, 'scripts', 'mermaid-render.mjs');

    // Write .mmd source to file
    const tmpDir = path.join(safeOutputDir, 'assets', 'diagrams');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    const mmdPath = path.join(tmpDir, `${diagramName}.mmd`);

    const runRender = (source: string) =>
      new Promise<{ ok: boolean; stdout?: string; error?: string; stderr?: string }>((resolve) => {
        fs.writeFileSync(mmdPath, source);
        execFile(nodeExec, [script, 'render', mmdPath, '--slug', slug, '--name', diagramName, '--output', safeOutputDir], {
          cwd: seoRoot,
          env: toolEnv,
          timeout: 60_000,
        }, (error, stdout, stderr) => {
          if (error) {
            resolve({ ok: false, error: error.message, stderr: stderr?.slice(0, 1000) });
            return;
          }
          resolve({ ok: true, stdout });
        });
      });

    const first = await runRender(mermaidSource);
    if (first.ok) {
      return JSON.stringify({ success: true, output: first.stdout, mmdPath });
    }

    const parseLikeError = /Parse error|TAGSTART|Unexpected token|Expecting/i.test(
      `${first.error || ''}\n${first.stderr || ''}`,
    );

    if (!parseLikeError) {
      return JSON.stringify({ success: false, error: first.error, stderr: first.stderr });
    }

    // Retry once after sanitizing HTML-like tags and smart punctuation.
    const sanitized = mermaidSource
      .replace(/<br\s*\/?>/gi, '\\n')
      .replace(/<[^>]+>/g, '')
      .replace(/[•]/g, '-')
      .replace(/[“”]/g, '"')
      .replace(/[’]/g, "'");

    const second = await runRender(sanitized);
    if (second.ok) {
      return JSON.stringify({
        success: true,
        output: second.stdout,
        mmdPath,
        sanitized: true,
      });
    }

    return JSON.stringify({
      success: false,
      error: second.error || first.error,
      stderr: second.stderr || first.stderr,
      retriedWithSanitizedSource: true,
    });
  },
});
