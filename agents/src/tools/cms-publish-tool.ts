import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';

const CMS_URL = process.env.PAYLOAD_CMS_URL || 'https://cms.tokenomics.net';
const API_KEY = process.env.PAYLOAD_API_KEY || '';

const cmsParams = z.object({
  title: z.string().describe('Post title'),
  slug: z.string().describe('Post slug'),
  content: z.string().describe('Full MDX content body'),
  excerpt: z.string().describe('Meta description / excerpt (150-160 chars)'),
  category: z.string().describe('Post category'),
  tags: z.array(z.string()).describe('Post tags (3-5)'),
  heroImagePath: z.string().optional().describe('Absolute path to the hero image file'),
  ogImagePath: z.string().optional().describe('Absolute path to the OG image file'),
});

/**
 * Upload a media file to Payload CMS
 */
async function uploadMedia(filePath: string, altText: string): Promise<string> {
  const fileName = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
    : ext === '.png' ? 'image/png'
    : ext === '.webp' ? 'image/webp'
    : 'application/octet-stream';

  const boundary = `----FormBoundary${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="alt"\r\n\r\n${altText}\r\n--${boundary}--\r\n`),
  ]);

  const result = await cmsRequest('POST', '/api/media', body, `multipart/form-data; boundary=${boundary}`);
  return result.doc?.id;
}

/**
 * Generic CMS HTTP request
 */
function cmsRequest(method: string, apiPath: string, body?: any, contentType?: string): Promise<any> {
  const url = new URL(`${CMS_URL}${apiPath}`);
  const client = url.protocol === 'https:' ? https : http;
  const bodyData = contentType?.includes('multipart')
    ? body
    : (body ? Buffer.from(JSON.stringify(body)) : null);

  return new Promise((resolve, reject) => {
    const req = client.request(url, {
      method,
      headers: {
        'Authorization': `users API-Key ${API_KEY}`,
        'Content-Type': contentType || 'application/json',
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
          reject(new Error(`CMS API error ${res.statusCode}: ${data.slice(0, 300)}`));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`CMS request failed: ${e.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error('CMS request timeout')); });

    if (bodyData) req.write(bodyData);
    req.end();
  });
}

export const cmsPublishTool = new FunctionTool({
  name: 'publish_draft_to_cms',
  description: 'Publish a blog post as a DRAFT to Payload CMS at cms.tokenomics.net. Uploads hero and OG images as media, then creates the post with _status=draft. Tony reviews and publishes manually from the CMS dashboard.',
  parameters: cmsParams as any,
  execute: async (args: any) => {
    const { title, slug, content, excerpt, category, tags, heroImagePath, ogImagePath } = args;

    try {
      let heroMediaId: string | null = null;
      if (heroImagePath && fs.existsSync(heroImagePath)) {
        heroMediaId = await uploadMedia(heroImagePath, `${slug}-hero`);
      }

      let ogMediaId: string | null = null;
      if (ogImagePath && fs.existsSync(ogImagePath)) {
        ogMediaId = await uploadMedia(ogImagePath, `${slug}-og`);
      }

      const postData: Record<string, any> = {
        title,
        slug,
        content,
        excerpt,
        category,
        tags,
        _status: 'draft',
      };

      if (heroMediaId) postData.heroImage = heroMediaId;
      if (ogMediaId) postData.ogImage = ogMediaId;

      const result = await cmsRequest('POST', '/api/posts', postData);

      return JSON.stringify({
        success: true,
        postId: result.doc?.id,
        slug: result.doc?.slug,
        status: 'draft',
        message: `Draft created at ${CMS_URL}/admin/collections/posts/${result.doc?.id}`,
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  },
});
