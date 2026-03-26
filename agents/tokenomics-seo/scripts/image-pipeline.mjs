#!/usr/bin/env node

/**
 * Tokenomics.net Image Pipeline
 *
 * Generates hero images via Gemini API (Nano Banana Pro), composites OG images
 * with Sharp (title + SVG logo overlay), and produces optimized web variants.
 *
 * Brand Direction: "Precision Infrastructure" — Isometric, Peter Tarka-style
 * cohesive worlds with cream geometric blocks, metallic gold trim, frosted
 * glass energy circuit pathways on charcoal backgrounds.
 *
 * Usage:
 *   node scripts/image-pipeline.mjs hero "prompt text" --slug my-post --output ./output/2026-02-10/my-post
 *   node scripts/image-pipeline.mjs og --slug my-post --title "Post Title Here" --hero ./path/to/hero-4k.png --output ./output/2026-02-10/my-post
 *   node scripts/image-pipeline.mjs diagram "prompt text" --slug my-post --name diagram-name --output ./output/2026-02-10/my-post [--logo]
 *   node scripts/image-pipeline.mjs optimize --input ./path/to/image.png --output ./output/dir --widths 1200,800
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const FONTS_DIR = path.join(ROOT, 'brand', 'fonts');
const LOGOS_DIR = path.join(ROOT, 'uploads', 'logos');

// Brand colors
const BRAND = {
  charcoal: '#1A1714',
  cream: '#FAF8F5',
  gold: '#B8956E',
  darkGold: '#96734E',
  lightGold: '#D4B896',
};

// Font paths
const FONTS = {
  serifBold: path.join(FONTS_DIR, 'LibreBaskerville-Bold.ttf'),
  serifRegular: path.join(FONTS_DIR, 'LibreBaskerville-Regular.ttf'),
  sansRegular: path.join(FONTS_DIR, 'LibreFranklin-Regular.ttf'),
};

// Logo paths
const LOGOS = {
  light: path.join(LOGOS_DIR, 'tokenomics-logo-light.svg'),
  dark: path.join(LOGOS_DIR, 'tokenomics-logo-dark.svg'),
  combined: path.join(LOGOS_DIR, 'tokenomics-logo-combined.svg'),
};

/**
 * Generate an image using the Gemini API
 * Supports multi-image input (pass referenceImages array of file paths)
 */
async function generateWithGemini(prompt, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not set. Add it to .env.local');
  }

  // Available image generation models:
  // - gemini-2.0-flash-exp-image-generation (legacy, no aspectRatio)
  // - gemini-2.5-flash-image ("Nano Banana" - fast, supports aspectRatio)
  // - gemini-3-pro-image-preview ("Nano Banana Pro" - pro quality, 4K, thinking mode)
  const model = options.model || 'gemini-3-pro-image-preview';

  // Build generation config
  const generationConfig = {
    responseModalities: ['TEXT', 'IMAGE'],
  };

  // Add imageConfig for models that support it (all except legacy 2.0-flash-exp)
  if (!model.includes('2.0-flash-exp')) {
    generationConfig.imageConfig = {
      aspectRatio: options.aspectRatio || '16:9',
    };
    // Nano Banana Pro supports 4K output
    if (model.includes('3-pro')) {
      generationConfig.imageConfig.imageSize = '4K';
    }
  }

  // Build content parts: text prompt + optional reference images
  const parts = [{ text: prompt }];

  if (options.referenceImages && options.referenceImages.length > 0) {
    for (const imgPath of options.referenceImages) {
      const imgData = fs.readFileSync(imgPath);
      const ext = path.extname(imgPath).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
        : ext === '.webp' ? 'image/webp'
        : 'image/png';
      parts.push({
        inlineData: {
          mimeType,
          data: imgData.toString('base64'),
        },
      });
      console.log(`  Reference image attached: ${path.basename(imgPath)}`);
    }
  }

  // Use https module instead of fetch — Node.js 25 built-in fetch causes issues
  // with Gemini API image generation endpoints
  const requestBody = JSON.stringify({
    contents: [{ parts }],
    generationConfig,
  });

  const maxRetries = options.maxRetries || 5;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`);

      const data = await new Promise((resolve, reject) => {
        const reqOptions = {
          hostname: url.hostname,
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(requestBody),
          },
        };

        const req = https.request(reqOptions, (res) => {
          let body = '';
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                resolve(JSON.parse(body));
              } catch (e) {
                reject(new Error(`Failed to parse Gemini response: ${e.message}`));
              }
            } else if (res.statusCode === 500 || res.statusCode === 503 || res.statusCode === 429) {
              reject(new Error(`RETRYABLE: Gemini API ${res.statusCode}: ${body.substring(0, 200)}`));
            } else {
              reject(new Error(`Gemini API error (${res.statusCode}): ${body}`));
            }
          });
        });

        req.on('error', (e) => reject(new Error(`Gemini request failed: ${e.message}`)));
        req.write(requestBody);
        req.end();
      });

      // Success — extract image from response
      const responseParts = data.candidates?.[0]?.content?.parts || [];
      for (const part of responseParts) {
        if (part.inlineData) {
          return Buffer.from(part.inlineData.data, 'base64');
        }
      }
      throw new Error('No image data in Gemini response. Response: ' + JSON.stringify(data.candidates?.[0], null, 2));

    } catch (err) {
      lastError = err;
      if (err.message.startsWith('RETRYABLE:') && attempt < maxRetries) {
        const delay = Math.min(2000 * Math.pow(2, attempt - 1), 30000); // 2s, 4s, 8s, 16s, 30s
        console.log(`  Attempt ${attempt}/${maxRetries} failed (server busy). Retrying in ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw new Error(err.message.replace('RETRYABLE: ', ''));
    }
  }

  throw lastError || new Error('No image generated after all retries');
}

/**
 * Convert SVG logo to PNG buffer at specified width using Sharp
 */
async function logoToPng(logoSvgPath, width) {
  const sharp = (await import('sharp')).default;
  const svgBuffer = fs.readFileSync(logoSvgPath);
  return sharp(svgBuffer)
    .resize(width, null, { fit: 'inside' })
    .png()
    .toBuffer();
}

/**
 * Create an OG image by compositing title text + SVG logo onto a hero image
 */
async function createOgImage(heroPath, title, outputPath) {
  const sharp = (await import('sharp')).default;

  // Layout:
  //  ┌──────────────────────────────────┐
  //  │ ░░[Logo ~500px]░░               │  ← top-left, soft vignette shadow
  //  │  ░░░░░░░░░░░░░░░               │
  //  │         (hero image visible)     │
  //  │                                  │
  //  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  ← bottom gradient
  //  │▓ Big Bold Title Text            ▓│  ← 64px Libre Baskerville Bold
  //  └──────────────────────────────────┘
  //  ░ = feGaussianBlur ellipse (stdDeviation=60, no hard edges)
  //  ▓ = linear gradient (0% → 50%@25% → 92%@100%)

  const OG_WIDTH = 1200;
  const OG_HEIGHT = 630;
  const MARGIN = 48;
  const TEXT_AREA_WIDTH = OG_WIDTH - MARGIN * 2;
  const LOGO_WIDTH = 500;
  const LOGO_TOP = 32;
  const LOGO_LEFT = 36;

  // Read and resize hero to OG dimensions
  const heroBuffer = await sharp(heroPath)
    .resize(OG_WIDTH, OG_HEIGHT, { fit: 'cover' })
    .toBuffer();

  // Title font: 64px base, steps down for long titles
  let fontSize = 64;
  let avgCharWidth = fontSize * 0.53;
  let maxCharsPerLine = Math.floor(TEXT_AREA_WIDTH / avgCharWidth);

  // Word wrap
  function wrapTitle(text, maxChars) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    for (const word of words) {
      if ((currentLine + ' ' + word).trim().length > maxChars) {
        lines.push(currentLine.trim());
        currentLine = word;
      } else {
        currentLine = (currentLine + ' ' + word).trim();
      }
    }
    if (currentLine) lines.push(currentLine.trim());
    return lines;
  }

  let lines = wrapTitle(title, maxCharsPerLine);

  // Step down for longer titles
  if (lines.length > 2) {
    fontSize = 52;
    avgCharWidth = fontSize * 0.53;
    maxCharsPerLine = Math.floor(TEXT_AREA_WIDTH / avgCharWidth);
    lines = wrapTitle(title, maxCharsPerLine);
  }
  if (lines.length > 3) {
    fontSize = 44;
    avgCharWidth = fontSize * 0.53;
    maxCharsPerLine = Math.floor(TEXT_AREA_WIDTH / avgCharWidth);
    lines = wrapTitle(title, maxCharsPerLine);
  }

  const lineHeight = Math.round(fontSize * 1.2);
  const textBlockHeight = lines.length * lineHeight;
  const TITLE_BOTTOM_MARGIN = 40;

  // Gradient covers title + breathing room above
  const gradientHeight = textBlockHeight + 140;

  // Read font for SVG embedding
  const fontBoldData = fs.readFileSync(FONTS.serifBold);
  const fontBoldBase64 = fontBoldData.toString('base64');

  // Position title text anchored to bottom-left
  const textBaseY = OG_HEIGHT - TITLE_BOTTOM_MARGIN;

  const titleLines = lines.map((line, i) => {
    // Position from bottom up: last line at textBaseY, previous lines above
    const lineIndex = lines.length - 1 - i;
    const y = textBaseY - (lineIndex * lineHeight);
    return `<text x="${MARGIN}" y="${y}" font-family="LibreBaskerville-Bold, serif" font-size="${fontSize}" font-weight="bold" fill="${BRAND.cream}">${escapeXml(line)}</text>`;
  }).join('\n    ');

  // SVG overlay: bottom gradient + title text
  const svgOverlay = `
  <svg width="${OG_WIDTH}" height="${OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <style>
        @font-face {
          font-family: 'LibreBaskerville-Bold';
          src: url('data:font/ttf;base64,${fontBoldBase64}');
          font-weight: bold;
        }
      </style>
      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${BRAND.charcoal}" stop-opacity="0"/>
        <stop offset="25%" stop-color="${BRAND.charcoal}" stop-opacity="0.5"/>
        <stop offset="100%" stop-color="${BRAND.charcoal}" stop-opacity="0.92"/>
      </linearGradient>
      <!-- Soft blur filter for logo vignette shadow -->
      <filter id="logoBlur" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="60"/>
      </filter>
    </defs>

    <!-- Top-left vignette shadow behind logo: blurred ellipse for soft natural fade -->
    <ellipse cx="${LOGO_WIDTH * 0.35}" cy="50" rx="${LOGO_WIDTH * 0.65}" ry="120" fill="${BRAND.charcoal}" opacity="0.9" filter="url(#logoBlur)"/>

    <!-- Bottom gradient for title readability -->
    <rect x="0" y="${OG_HEIGHT - gradientHeight}" width="${OG_WIDTH}" height="${gradientHeight}" fill="url(#grad)"/>

    <!-- Title text, bottom-left -->
    ${titleLines}
  </svg>`;

  // Prepare logo PNG from SVG — top-left placement
  const logoPng = await logoToPng(LOGOS.light, LOGO_WIDTH);

  // Composite: hero → gradient+title SVG → logo top-left
  await sharp(heroBuffer)
    .composite([
      { input: Buffer.from(svgOverlay), top: 0, left: 0 },
      {
        input: logoPng,
        top: LOGO_TOP,
        left: LOGO_LEFT,
      },
    ])
    .jpeg({ quality: 90 })
    .toFile(outputPath);

  console.log(`  OG image created: ${outputPath}`);
}

/**
 * Optimize an image: create resized JPG + WebP variants
 */
async function optimizeImage(inputPath, outputDir, widths = [1200, 800]) {
  const sharp = (await import('sharp')).default;
  const ext = path.extname(inputPath);
  const name = path.basename(inputPath, ext);
  const results = [];

  for (const width of widths) {
    const jpgPath = path.join(outputDir, `${name}-${width}w.jpg`);
    const webpPath = path.join(outputDir, `${name}-${width}w.webp`);

    await sharp(inputPath)
      .resize(width, null, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(jpgPath);

    await sharp(inputPath)
      .resize(width, null, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(webpPath);

    results.push(jpgPath, webpPath);
    console.log(`  Optimized: ${width}w JPG + WebP`);
  }

  return results;
}

/**
 * Escape special XML characters
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Ensure a directory exists
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Load .env.local if it exists
 */
function loadEnv() {
  const envPath = path.join(ROOT, '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  }
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

loadEnv();

if (command === 'hero') {
  // Generate a hero image
  const prompt = args._[1];
  const slug = args.slug;
  const outputDir = args.output || path.join(ROOT, 'output', 'images');

  if (!prompt) {
    console.error('Usage: image-pipeline.mjs hero "prompt" --slug post-slug --output ./output/dir');
    process.exit(1);
  }

  ensureDir(path.join(outputDir, 'assets'));

  console.log(`Generating hero image for: ${slug || 'unnamed'}`);
  const imageBuffer = await generateWithGemini(prompt, { aspectRatio: '16:9' });

  // Save 4K base asset
  const basePath = path.join(outputDir, 'assets', 'hero-4k.png');
  fs.writeFileSync(basePath, imageBuffer);
  console.log(`  Base asset saved: ${basePath}`);

  // Generate optimized variants
  await optimizeImage(basePath, path.join(outputDir, 'assets'), [1200]);

  console.log('Hero image generation complete.');

} else if (command === 'og') {
  // Create OG image from hero + title + logo
  const slug = args.slug;
  const title = args.title;
  const heroPath = args.hero;
  const outputDir = args.output || path.join(ROOT, 'output', 'images');

  if (!title || !heroPath) {
    console.error('Usage: image-pipeline.mjs og --slug post-slug --title "Title" --hero ./path/to/hero-4k.png --output ./output/dir');
    process.exit(1);
  }

  ensureDir(path.join(outputDir, 'assets'));

  console.log(`Creating OG image for: ${slug || 'unnamed'}`);
  const ogPath = path.join(outputDir, 'assets', 'og-1200x630.jpg');
  await createOgImage(heroPath, title, ogPath);

  // Also create WebP variant
  const sharp = (await import('sharp')).default;
  const webpPath = path.join(outputDir, 'assets', 'og-1200x630.webp');
  await sharp(ogPath).webp({ quality: 85 }).toFile(webpPath);
  console.log(`  OG WebP variant: ${webpPath}`);

  console.log('OG image creation complete.');

} else if (command === 'diagram') {
  // Generate an inline diagram, optionally with logo reference image
  const prompt = args._[1];
  const slug = args.slug;
  const name = args.name || 'diagram';
  const outputDir = args.output || path.join(ROOT, 'output', 'images');
  const aspectRatio = args.aspect || '4:3';
  const includeLogo = args.logo !== undefined;

  if (!prompt) {
    console.error('Usage: image-pipeline.mjs diagram "prompt" --slug post-slug --name diagram-name --output ./output/dir [--logo]');
    process.exit(1);
  }

  ensureDir(path.join(outputDir, 'assets', 'diagrams'));

  // Optionally convert logo SVG to PNG for Gemini reference
  const referenceImages = [];
  if (includeLogo) {
    const sharp = (await import('sharp')).default;
    const logoPngPath = path.join(ROOT, '.cache', 'logo-reference.png');
    ensureDir(path.dirname(logoPngPath));
    await sharp(fs.readFileSync(LOGOS.light))
      .resize(400, null, { fit: 'inside' })
      .png()
      .toFile(logoPngPath);
    referenceImages.push(logoPngPath);
    console.log(`  Logo reference prepared for Gemini input`);
  }

  console.log(`Generating diagram "${name}" for: ${slug || 'unnamed'}`);
  const imageBuffer = await generateWithGemini(prompt, {
    aspectRatio,
    referenceImages,
  });

  // Save base asset
  const basePath = path.join(outputDir, 'assets', 'diagrams', `${name}-base.png`);
  fs.writeFileSync(basePath, imageBuffer);
  console.log(`  Base asset saved: ${basePath}`);

  // Generate optimized variants
  await optimizeImage(basePath, path.join(outputDir, 'assets', 'diagrams'), [800]);

  console.log('Diagram generation complete.');

} else if (command === 'optimize') {
  // Optimize an existing image
  const inputPath = args.input;
  const outputDir = args.output || path.dirname(inputPath);
  const widths = args.widths ? args.widths.split(',').map(Number) : [1200, 800];

  if (!inputPath) {
    console.error('Usage: image-pipeline.mjs optimize --input ./path/to/image.png --output ./output/dir --widths 1200,800');
    process.exit(1);
  }

  ensureDir(outputDir);
  console.log(`Optimizing: ${inputPath}`);
  await optimizeImage(inputPath, outputDir, widths);
  console.log('Optimization complete.');

} else {
  console.log(`
Tokenomics.net Image Pipeline — "Precision Infrastructure"

Commands:
  hero "prompt"     Generate a hero image via Gemini (Nano Banana Pro)
  og                Create OG image (hero + title + logo overlay via Sharp)
  diagram "prompt"  Generate an inline diagram via Gemini
  optimize          Create optimized JPG + WebP variants

Options:
  --slug       Post slug (used for naming)
  --title      Post title (for OG overlay)
  --hero       Path to hero image (for OG creation)
  --name       Diagram name (for diagram generation)
  --output     Output directory
  --aspect     Aspect ratio (for diagrams, default: 4:3)
  --logo       Attach logo as reference image (for diagrams)
  --widths     Comma-separated widths for optimization (default: 1200,800)
  --model      Gemini model (default: gemini-3-pro-image-preview)

Examples:
  node scripts/image-pipeline.mjs hero "Isometric precision infrastructure..." --slug my-post --output ./output/2026-02-10/my-post
  node scripts/image-pipeline.mjs og --slug my-post --title "My Post Title" --hero ./output/2026-02-10/my-post/assets/hero-4k.png --output ./output/2026-02-10/my-post
  node scripts/image-pipeline.mjs diagram "Isometric diagram showing..." --slug my-post --name token-flow --output ./output/2026-02-10/my-post --logo
  `);
}
