import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { resolveNodeExec, resolveSeoRoot } from './runtime-paths.js';

const mermaidParams = z.object({
  mermaidSource: z.string().describe('The Mermaid diagram source code (e.g. flowchart TD, pie chart, etc.)'),
  slug: z.string().describe('The post slug for file naming'),
  diagramName: z.string().describe('Kebab-case diagram name (e.g. token-allocation, revenue-waterfall)'),
  outputDir: z.string().describe('Output directory for the rendered diagram'),
});

export const mermaidTool = new FunctionTool({
  name: 'render_mermaid_diagram',
  description: 'Render a Mermaid diagram (.mmd source) to a branded PNG image. Provide the Mermaid syntax, post slug, diagram name, and output directory. The diagram will be rendered using the Tokenomics.net brand styling.',
  parameters: mermaidParams as any,
  execute: async (args: any) => {
    const { mermaidSource, slug, diagramName, outputDir } = args;
    const seoRoot = resolveSeoRoot(['scripts/mermaid-render.mjs']);
    const nodeExec = resolveNodeExec();
    const script = path.join(seoRoot, 'scripts', 'mermaid-render.mjs');

    // Write .mmd source to file
    const tmpDir = path.join(outputDir, 'assets', 'diagrams');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    const mmdPath = path.join(tmpDir, `${diagramName}.mmd`);
    fs.writeFileSync(mmdPath, mermaidSource);

    return new Promise((resolve) => {
      execFile(nodeExec, [script, 'render', mmdPath, '--slug', slug, '--name', diagramName, '--output', outputDir], {
        cwd: seoRoot,
        env: { ...process.env },
        timeout: 60_000,
      }, (error, stdout, stderr) => {
        if (error) {
          resolve(JSON.stringify({ success: false, error: error.message, stderr: stderr?.slice(0, 500) }));
          return;
        }
        resolve(JSON.stringify({ success: true, output: stdout, mmdPath }));
      });
    });
  },
});
