/**
 * Build script: bundles src/sse-server.ts → dist/sse-server.mjs using esbuild.
 * Run: node build-sse.mjs
 */
import { build } from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [resolve(__dir, 'src/sse-server.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: resolve(__dir, 'dist/sse-server.mjs'),
  external: ['fsevents', 'puppeteer', 'sharp', '@mermaid-js/mermaid-cli'],
  sourcemap: true,
  minify: false,
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
});

console.log('✓ Built dist/sse-server.mjs');
