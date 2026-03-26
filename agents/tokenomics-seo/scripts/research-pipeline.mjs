#!/usr/bin/env node

/**
 * Tokenomics.net Research Pipeline
 *
 * Uses Perplexity Sonar via OpenRouter API to research topics and produce
 * GEO-optimized content briefs with citations, statistics, and expert quotes.
 *
 * Usage:
 *   node scripts/research-pipeline.mjs research "tokenomics vesting schedules" --output output/research/
 *   node scripts/research-pipeline.mjs research "DePIN token economics" --focus "statistics,expert-quotes,recent-developments" --output output/research/
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ─── Load .env.local ────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnv();

// ─── OpenRouter API ─────────────────────────────────────────────────────────

const OPENROUTER_BASE = 'openrouter.ai';
const OPENROUTER_PATH = '/api/v1/chat/completions';
const MODEL = 'perplexity/sonar';

/**
 * Call Perplexity Sonar via OpenRouter with exponential backoff.
 * Follows the same retry pattern as image-pipeline.mjs.
 */
async function callSonar(messages, options = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not set. Add it to .env.local');
  }

  const requestBody = JSON.stringify({
    model: MODEL,
    messages,
    temperature: options.temperature || 0.3,
    max_tokens: options.maxTokens || 4096,
  });

  const maxRetries = options.maxRetries || 5;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const data = await new Promise((resolve, reject) => {
        const reqOptions = {
          hostname: OPENROUTER_BASE,
          path: OPENROUTER_PATH,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://tokenomics.net',
            'X-Title': 'Tokenomics.net Research Pipeline',
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
                reject(new Error(`Failed to parse OpenRouter response: ${e.message}`));
              }
            } else if (res.statusCode === 429 || res.statusCode === 500 || res.statusCode === 503) {
              reject(new Error(`RETRYABLE: OpenRouter API ${res.statusCode}: ${body.substring(0, 200)}`));
            } else {
              reject(new Error(`OpenRouter API error (${res.statusCode}): ${body.substring(0, 500)}`));
            }
          });
        });

        req.on('error', (e) => reject(new Error(`OpenRouter request failed: ${e.message}`)));
        req.write(requestBody);
        req.end();
      });

      return data;
    } catch (err) {
      lastError = err;
      if (err.message.startsWith('RETRYABLE:') && attempt < maxRetries) {
        const delay = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
        console.log(`  Retry ${attempt}/${maxRetries} after ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

// ─── Research Prompts ───────────────────────────────────────────────────────

function buildResearchPrompt(topic, focusAreas) {
  const focusInstructions = focusAreas.length > 0
    ? `\nFocus especially on: ${focusAreas.join(', ')}.`
    : '';

  return `You are a research assistant for Tokenomics.net, a consultancy specializing in token economics design for Web3 projects. Research the following topic thoroughly and provide a structured brief.

Topic: "${topic}"
${focusInstructions}

Provide your response in the following JSON format (valid JSON only, no markdown):
{
  "summary": "A direct, answer-first paragraph of 40-60 words that concisely answers what someone searching this topic needs to know. No preamble.",
  "citations": [
    {
      "text": "The key claim or fact being cited",
      "source": "Source name (publication, organization, or author)",
      "url": "Direct URL to the source",
      "type": "statistic|expert-quote|fact"
    }
  ],
  "statistics": [
    {
      "stat": "The statistic with its number",
      "source": "Source name",
      "url": "Direct URL"
    }
  ],
  "expertQuotes": [
    {
      "quote": "The exact quote",
      "name": "Person's full name",
      "title": "Their title and organization",
      "source": "Where the quote was published or said"
    }
  ],
  "keyFacts": [
    "Bullet point fact 1",
    "Bullet point fact 2"
  ],
  "relatedTopics": [
    "Related topic for further research 1",
    "Related topic 2"
  ]
}

Requirements:
- Include at least 3 citations with working URLs
- Include at least 2 statistics with their sources
- Include at least 1 expert quote if available (real, attributed quotes only)
- Include 5-8 key facts as bullet points
- All URLs must be real and verifiable
- Focus on recent data (2024-2026 preferred)
- Prioritize primary sources over aggregators`;
}

// ─── Parse Sonar Response ───────────────────────────────────────────────────

function parseSonarResponse(response) {
  const content = response.choices?.[0]?.message?.content || '';

  // Try to parse the JSON from the response
  // Sonar sometimes wraps JSON in markdown code blocks
  let jsonStr = content;

  // Strip markdown code fences if present
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      ...parsed,
      _raw: content,
      _model: response.model || MODEL,
      _usage: response.usage || {},
    };
  } catch {
    // If JSON parsing fails, return raw content for manual extraction
    console.warn('  Warning: Could not parse structured JSON from Sonar response.');
    console.warn('  Returning raw content for manual extraction.');
    return {
      summary: '',
      citations: [],
      statistics: [],
      expertQuotes: [],
      keyFacts: [],
      relatedTopics: [],
      _raw: content,
      _model: response.model || MODEL,
      _usage: response.usage || {},
      _parseError: true,
    };
  }
}

// ─── CLI Commands ───────────────────────────────────────────────────────────

async function researchCommand(topic, options) {
  console.log(`\n=== Tokenomics.net Research Pipeline ===`);
  console.log(`Topic: "${topic}"`);
  console.log(`Model: ${MODEL} (via OpenRouter)`);

  const focusAreas = options.focus
    ? options.focus.split(',').map(f => f.trim())
    : [];

  if (focusAreas.length > 0) {
    console.log(`Focus: ${focusAreas.join(', ')}`);
  }

  console.log(`\nQuerying Perplexity Sonar...`);

  const prompt = buildResearchPrompt(topic, focusAreas);

  const response = await callSonar([
    { role: 'user', content: prompt },
  ]);

  console.log(`Response received.`);

  const brief = parseSonarResponse(response);

  // Add metadata
  const output = {
    topic,
    generatedAt: new Date().toISOString(),
    focusAreas,
    ...brief,
  };

  // Determine output path
  const outputDir = options.output || path.join(ROOT, 'output', 'research');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const outputPath = path.join(outputDir, `${slug}-research-brief.json`);

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  // Print summary
  console.log(`\n=== Research Brief ===`);
  console.log(`Summary: ${output.summary || '(parsing required)'}`);
  console.log(`Citations: ${output.citations?.length || 0}`);
  console.log(`Statistics: ${output.statistics?.length || 0}`);
  console.log(`Expert Quotes: ${output.expertQuotes?.length || 0}`);
  console.log(`Key Facts: ${output.keyFacts?.length || 0}`);

  if (output._parseError) {
    console.log(`\n⚠️  JSON parsing failed — raw response saved for manual extraction.`);
  }

  console.log(`\nSaved: ${outputPath}`);
  return output;
}

// ─── CLI Entry Point ────────────────────────────────────────────────────────

function parseArgs(args) {
  const options = {};
  let i = 0;
  while (i < args.length) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      options[key] = args[i + 1] || true;
      i += 2;
    } else {
      i++;
    }
  }
  return options;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
Tokenomics.net Research Pipeline
Uses Perplexity Sonar via OpenRouter for GEO-optimized research briefs.

Usage:
  node scripts/research-pipeline.mjs research "topic" [options]

Options:
  --output <dir>      Output directory (default: output/research/)
  --focus <areas>     Comma-separated focus areas (e.g. "statistics,expert-quotes,recent-developments")

Examples:
  node scripts/research-pipeline.mjs research "tokenomics vesting schedules"
  node scripts/research-pipeline.mjs research "DePIN token economics" --focus "statistics,expert-quotes"
  node scripts/research-pipeline.mjs research "token distribution best practices" --output ./output/2026-02-11/my-post
`);
    process.exit(1);
  }

  const command = args[0];
  const topic = args[1];
  const options = parseArgs(args.slice(2));

  if (command === 'research') {
    await researchCommand(topic, options);
  } else {
    console.error(`Unknown command: ${command}`);
    console.error('Available commands: research');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
