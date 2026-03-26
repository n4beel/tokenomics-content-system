#!/usr/bin/env node

/**
 * Tokenomics.net Mermaid Diagram Renderer
 *
 * Renders .mmd Mermaid source files to PNG images with brand styling,
 * then optimizes to JPG + WebP for the blog.
 *
 * Uses @mermaid-js/mermaid-cli (mmdc) under the hood with our branded
 * config (brand/mermaid-config.json) and font CSS (brand/mermaid-styles.css).
 *
 * Usage:
 *   node scripts/mermaid-render.mjs render <input.mmd> --slug my-post --name diagram-name --output ./output/2026-02-10/my-post
 *   node scripts/mermaid-render.mjs render <input.mmd> --slug my-post --name diagram-name --output ./output/dir --width 1600 --scale 3
 *   node scripts/mermaid-render.mjs batch --dir ./output/2026-02-10/my-post/assets/diagrams
 *
 * The .mmd source files are saved alongside rendered images for future editing.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Brand config and styles
const MERMAID_CONFIG = path.join(ROOT, 'brand', 'mermaid-config.json');
const MERMAID_CSS = path.join(ROOT, 'brand', 'mermaid-styles.css');
const BRAND_BG = '#1A1714';

// Default render settings
const DEFAULTS = {
  width: 1200,
  scale: 3,       // 3x for crisp PNG output
  bgColor: BRAND_BG,
};

// Optimized image output widths
const DIAGRAM_OUTPUT_WIDTH = 800;

/**
 * Render a .mmd file to PNG using mmdc
 */
function renderMermaid(inputPath, outputPngPath, options = {}) {
  const width = options.width || DEFAULTS.width;
  const scale = options.scale || DEFAULTS.scale;
  const bgColor = options.bgColor || DEFAULTS.bgColor;

  // Ensure output directory exists
  const outputDir = path.dirname(outputPngPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const cmd = [
    'npx', 'mmdc',
    '-i', `"${inputPath}"`,
    '-o', `"${outputPngPath}"`,
    '-c', `"${MERMAID_CONFIG}"`,
    '-C', `"${MERMAID_CSS}"`,
    '-b', `"${bgColor}"`,
    '-w', String(width),
    '-s', String(scale),
  ].join(' ');

  console.log(`  Rendering: ${path.basename(inputPath)} → ${path.basename(outputPngPath)}`);

  try {
    execSync(cmd, { cwd: ROOT, stdio: 'pipe', timeout: 60000 });

    if (fs.existsSync(outputPngPath)) {
      const size = fs.statSync(outputPngPath).size;
      console.log(`  PNG created: ${outputPngPath} (${(size / 1024).toFixed(0)}KB)`);
      return true;
    } else {
      console.error(`  ERROR: PNG file not created at ${outputPngPath}`);
      return false;
    }
  } catch (err) {
    console.error(`  ERROR rendering ${inputPath}:`);
    console.error(`  ${err.stderr?.toString() || err.message}`);
    return false;
  }
}

/**
 * Optimize a PNG to JPG + WebP at a given width using Sharp
 */
async function optimizeImage(inputPng, outputDir, width = DIAGRAM_OUTPUT_WIDTH) {
  const sharp = (await import('sharp')).default;
  const name = path.basename(inputPng, '.png');

  const jpgPath = path.join(outputDir, `${name}-${width}w.jpg`);
  const webpPath = path.join(outputDir, `${name}-${width}w.webp`);

  await sharp(inputPng)
    .resize(width, null, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toFile(jpgPath);

  await sharp(inputPng)
    .resize(width, null, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(webpPath);

  const jpgSize = fs.statSync(jpgPath).size;
  const webpSize = fs.statSync(webpPath).size;

  console.log(`  Optimized: ${width}w JPG (${(jpgSize / 1024).toFixed(0)}KB) + WebP (${(webpSize / 1024).toFixed(0)}KB)`);

  return { jpgPath, webpPath, jpgSize, webpSize };
}

/**
 * Full pipeline: render .mmd → PNG → optimized JPG + WebP
 * Also copies the .mmd source file to the output directory for future editing
 */
async function renderAndOptimize(inputMmd, options = {}) {
  const slug = options.slug || 'unnamed';
  const name = options.name || path.basename(inputMmd, '.mmd');
  const outputDir = options.output || path.join(ROOT, 'output', 'images');
  const diagramsDir = path.join(outputDir, 'assets', 'diagrams');

  // Ensure directories exist
  if (!fs.existsSync(diagramsDir)) {
    fs.mkdirSync(diagramsDir, { recursive: true });
  }

  // Render to PNG
  const pngPath = path.join(diagramsDir, `${name}-base.png`);
  const success = renderMermaid(inputMmd, pngPath, options);

  if (!success) {
    console.error(`  Failed to render diagram: ${name}`);
    return null;
  }

  // Optimize to JPG + WebP
  const result = await optimizeImage(pngPath, diagramsDir);

  // Copy .mmd source file to diagrams directory for future reference
  const sourceDest = path.join(diagramsDir, `${name}.mmd`);
  fs.copyFileSync(inputMmd, sourceDest);
  console.log(`  Source saved: ${sourceDest}`);

  return {
    name,
    basePng: pngPath,
    ...result,
    source: sourceDest,
  };
}

/**
 * Render a diagram from inline Mermaid source (string)
 * Writes to a temp .mmd file, renders, then cleans up temp
 */
async function renderFromSource(mermaidSource, options = {}) {
  const name = options.name || 'diagram';
  const outputDir = options.output || path.join(ROOT, 'output', 'images');
  const diagramsDir = path.join(outputDir, 'assets', 'diagrams');

  // Ensure directories exist
  if (!fs.existsSync(diagramsDir)) {
    fs.mkdirSync(diagramsDir, { recursive: true });
  }

  // Write the .mmd source file directly to output
  const mmdPath = path.join(diagramsDir, `${name}.mmd`);
  fs.writeFileSync(mmdPath, mermaidSource);
  console.log(`  Source written: ${mmdPath}`);

  // Render to PNG
  const pngPath = path.join(diagramsDir, `${name}-base.png`);
  const success = renderMermaid(mmdPath, pngPath, options);

  if (!success) {
    console.error(`  Failed to render diagram: ${name}`);
    return null;
  }

  // Optimize to JPG + WebP
  const result = await optimizeImage(pngPath, diagramsDir);

  return {
    name,
    basePng: pngPath,
    source: mmdPath,
    ...result,
  };
}

/**
 * Batch render all .mmd files in a directory
 */
async function batchRender(dir, options = {}) {
  const mmdFiles = fs.readdirSync(dir).filter(f => f.endsWith('.mmd'));

  if (mmdFiles.length === 0) {
    console.log(`  No .mmd files found in ${dir}`);
    return [];
  }

  console.log(`  Found ${mmdFiles.length} .mmd files to render`);
  const results = [];

  for (const file of mmdFiles) {
    const inputPath = path.join(dir, file);
    const name = path.basename(file, '.mmd');
    const pngPath = path.join(dir, `${name}-base.png`);

    console.log(`\n  --- ${name} ---`);
    const success = renderMermaid(inputPath, pngPath, options);

    if (success) {
      const result = await optimizeImage(pngPath, dir);
      results.push({ name, ...result });
    }
  }

  return results;
}

/**
 * Parse CLI arguments
 */
function parseArgs(args) {
  const parsed = { _: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      parsed[key] = args[i + 1] || true;
      i++;
    } else {
      parsed._.push(args[i]);
    }
  }
  return parsed;
}

// ──────────────────────────────────────
// CLI Entry Point
// ──────────────────────────────────────

const args = parseArgs(process.argv.slice(2));
const command = args._[0];

if (command === 'render') {
  const inputPath = args._[1];

  if (!inputPath) {
    console.error('Usage: mermaid-render.mjs render <input.mmd> --slug post-slug --name diagram-name --output ./output/dir');
    process.exit(1);
  }

  console.log(`\nTokenomics.net Mermaid Renderer`);
  console.log(`Rendering: ${inputPath}`);

  const result = await renderAndOptimize(inputPath, {
    slug: args.slug,
    name: args.name || path.basename(inputPath, '.mmd'),
    output: args.output,
    width: args.width ? parseInt(args.width) : undefined,
    scale: args.scale ? parseInt(args.scale) : undefined,
  });

  if (result) {
    console.log(`\nDiagram "${result.name}" rendered successfully.`);
  } else {
    console.error('\nDiagram rendering failed.');
    process.exit(1);
  }

} else if (command === 'batch') {
  const dir = args.dir;

  if (!dir) {
    console.error('Usage: mermaid-render.mjs batch --dir ./path/to/diagrams');
    process.exit(1);
  }

  console.log(`\nTokenomics.net Mermaid Batch Renderer`);
  console.log(`Directory: ${dir}`);

  const results = await batchRender(dir, {
    width: args.width ? parseInt(args.width) : undefined,
    scale: args.scale ? parseInt(args.scale) : undefined,
  });

  console.log(`\nBatch complete: ${results.length} diagrams rendered.`);

} else {
  console.log(`
Tokenomics.net Mermaid Diagram Renderer

Commands:
  render <input.mmd>   Render a single .mmd file to branded PNG + JPG + WebP
  batch                Render all .mmd files in a directory

Options:
  --slug       Post slug (used for naming)
  --name       Diagram name (defaults to filename)
  --output     Output directory (post package root)
  --dir        Directory for batch rendering
  --width      Render width in px (default: ${DEFAULTS.width})
  --scale      Device scale factor (default: ${DEFAULTS.scale})

Brand config: ${MERMAID_CONFIG}
Brand CSS:    ${MERMAID_CSS}
Background:   ${DEFAULTS.bgColor}

Examples:
  node scripts/mermaid-render.mjs render diagrams/token-flow.mmd --slug my-post --name token-flow --output ./output/2026-02-10/my-post
  node scripts/mermaid-render.mjs batch --dir ./output/2026-02-10/my-post/assets/diagrams
  `);
}
