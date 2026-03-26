import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { resolveRunScopedRoot, resolveSeoRoot } from './runtime-paths.js';

const CONTENT_API_URL = process.env.CONTENT_SYSTEM_API_URL || 'http://localhost:3000';
const AGENT_PUBLISH_KEY = process.env.AGENT_PUBLISH_KEY || '';
const OUTPUT_BUCKET_NAME = process.env.OUTPUT_BUCKET_NAME || '';
const OUTPUT_BUCKET_ENDPOINT = process.env.OUTPUT_BUCKET_ENDPOINT || '';
const OUTPUT_BUCKET_REGION = process.env.OUTPUT_BUCKET_REGION || 'auto';
const OUTPUT_BUCKET_ACCESS_KEY_ID = process.env.OUTPUT_BUCKET_ACCESS_KEY_ID || '';
const OUTPUT_BUCKET_SECRET_ACCESS_KEY = process.env.OUTPUT_BUCKET_SECRET_ACCESS_KEY || '';
const OUTPUT_BUCKET_PREFIX = (process.env.OUTPUT_BUCKET_PREFIX || 'tokenomics-output').replace(/^\/+|\/+$/g, '');

let outputBucketClient: S3Client | null | undefined;

const cmsParams = z.object({
  title: z.string().describe('Post title'),
  slug: z.string().describe('Post slug'),
  content: z.string().describe('Full MDX content body'),
  excerpt: z.string().describe('Meta description / excerpt (150-160 chars)'),
  category: z.string().optional().describe('Optional post category label (currently not persisted by API-offloaded publish)'),
  tags: z.array(z.string()).optional().describe('Optional post tags (currently not persisted by API-offloaded publish)'),
  heroImagePath: z.string().optional().describe('Absolute path to the hero image file'),
  ogImagePath: z.string().optional().describe('Absolute path to the OG image file'),
  runId: z.string().optional().describe('Run identifier (e.g. blog-abc12345) used for output organization and publish tracing'),
});

/**
 * Generic HTTP request
 */
function requestJson(method: string, fullUrl: string, body?: any, contentType?: string): Promise<any> {
  const url = new URL(fullUrl);
  const client = url.protocol === 'https:' ? https : http;
  const bodyData = contentType?.includes('multipart')
    ? body
    : (body ? Buffer.from(JSON.stringify(body)) : null);

  return new Promise((resolve, reject) => {
    const req = client.request(url, {
      method,
      headers: {
        'Content-Type': contentType || 'application/json',
        ...(AGENT_PUBLISH_KEY ? { 'x-agent-publish-key': AGENT_PUBLISH_KEY } : {}),
        ...(bodyData ? { 'Content-Length': bodyData.length } : {}),
      },
      timeout: 30_000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ raw: data });
          }
        } else {
          reject(new Error(`API error ${res.statusCode}: ${data.slice(0, 600)}`));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`API request failed: ${e.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error('API request timeout')); });

    if (bodyData) req.write(bodyData);
    req.end();
  });
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._/-]/g, '-').replace(/\/+/g, '/').replace(/\.\./g, '-').replace(/\/\/+/, '/').replace(/\/+$|^\//g, '');
}

function detectContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.mmd') return 'text/plain';
  if (ext === '.md' || ext === '.mdx') return 'text/markdown';
  return 'application/octet-stream';
}

function getOutputBucketClient(): S3Client | null {
  if (outputBucketClient !== undefined) return outputBucketClient;

  const configured =
    !!OUTPUT_BUCKET_NAME &&
    !!OUTPUT_BUCKET_ENDPOINT &&
    !!OUTPUT_BUCKET_ACCESS_KEY_ID &&
    !!OUTPUT_BUCKET_SECRET_ACCESS_KEY;

  if (!configured) {
    outputBucketClient = null;
    return outputBucketClient;
  }

  outputBucketClient = new S3Client({
    region: OUTPUT_BUCKET_REGION,
    endpoint: OUTPUT_BUCKET_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: OUTPUT_BUCKET_ACCESS_KEY_ID,
      secretAccessKey: OUTPUT_BUCKET_SECRET_ACCESS_KEY,
    },
  });

  return outputBucketClient;
}

async function uploadArtifactToOutputBucket(localPath: string, objectKey: string): Promise<void> {
  const client = getOutputBucketClient();
  if (!client || !OUTPUT_BUCKET_NAME) {
    throw new Error('Output bucket is not configured');
  }

  const buffer = fs.readFileSync(localPath);
  await client.send(
    new PutObjectCommand({
      Bucket: OUTPUT_BUCKET_NAME,
      Key: objectKey,
      Body: buffer,
      ContentType: detectContentType(localPath),
    }),
  );
}

function buildOutputObjectKey(runId: string | undefined, slug: string, filePath: string): string {
  const safeRunId = sanitizeSegment((runId || 'adhoc').trim() || 'adhoc');
  const safeSlug = sanitizeSegment(slug || 'untitled');
  const fileName = sanitizeSegment(path.basename(filePath));
  return `${OUTPUT_BUCKET_PREFIX}/runs/${safeRunId}/blog/${safeSlug}/assets/${fileName}`;
}

export const cmsPublishTool = new FunctionTool({
  name: 'publish_draft_to_cms',
  description: 'Publish a blog draft through the internal Content API. The API handles media upload and CMS draft creation (media-first).',
  parameters: cmsParams as any,
  execute: async (args: any) => {
    const { title, slug, content, excerpt, heroImagePath, ogImagePath, runId } = args;

    try {
      const seoRoot = resolveSeoRoot([]);
      const runRoot = resolveRunScopedRoot(seoRoot, runId);
      const postDir = path.join(runRoot, 'posts', slug);
      fs.mkdirSync(postDir, { recursive: true });

      const publishedMapPath = path.join(runRoot, 'posts', '.published.json');
      let publishedMap: Record<string, any> = {};
      if (fs.existsSync(publishedMapPath)) {
        try {
          publishedMap = JSON.parse(fs.readFileSync(publishedMapPath, 'utf-8')) || {};
        } catch {
          publishedMap = {};
        }
      }

      if (publishedMap[slug]?.postId) {
        return JSON.stringify({
          success: true,
          postId: publishedMap[slug].postId,
          slug,
          status: 'draft',
          runId,
          message: `Draft already published for slug ${slug} in this run`,
        });
      }

      const contentPath = path.join(postDir, 'draft-raw.mdx');
      fs.writeFileSync(contentPath, content, 'utf-8');

      let heroImageObjectKey: string | undefined;
      let ogImageObjectKey: string | undefined;

      if (heroImagePath && fs.existsSync(heroImagePath)) {
        try {
          const key = buildOutputObjectKey(runId, slug, heroImagePath);
          await uploadArtifactToOutputBucket(heroImagePath, key);
          heroImageObjectKey = key;
        } catch {
          // Fall back to local path handling when bucket upload is unavailable.
        }
      }

      if (ogImagePath && fs.existsSync(ogImagePath)) {
        try {
          const key = buildOutputObjectKey(runId, slug, ogImagePath);
          await uploadArtifactToOutputBucket(ogImagePath, key);
          ogImageObjectKey = key;
        } catch {
          // Fall back to local path handling when bucket upload is unavailable.
        }
      }

      const payload = {
        title,
        slug,
        // Always include inline content so API publish works when services don't share a filesystem.
        content,
        contentPath,
        excerpt,
        heroImagePath,
        ogImagePath,
        heroImageObjectKey,
        ogImageObjectKey,
        runId,
      };

      const endpoint = `${CONTENT_API_URL.replace(/\/+$/, '')}/api/batch/cms-publish-draft`;
      const result = await requestJson('POST', endpoint, payload);

      if (result?.success && result?.postId) {
        publishedMap[slug] = {
          postId: result.postId,
          publishedAt: new Date().toISOString(),
        };
        fs.writeFileSync(publishedMapPath, JSON.stringify(publishedMap, null, 2));
      }

      return JSON.stringify({
        success: !!result?.success,
        postId: result?.postId,
        slug: result?.slug || slug,
        status: result?.status || 'draft',
        runId,
        message: result?.message || 'Draft publish request completed via API',
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  },
});
