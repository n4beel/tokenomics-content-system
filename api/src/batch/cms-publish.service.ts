import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

export interface CmsPublishRequest {
    title: string;
    slug: string;
    excerpt: string;
    category?: string;
    tags?: string[];
    contentPath?: string;
    content?: string;
    heroImagePath?: string;
    ogImagePath?: string;
    heroImageObjectKey?: string;
    ogImageObjectKey?: string;
    runId?: string;
}

@Injectable()
export class CmsPublishService {
    private readonly cmsBaseUrl: string;
    private readonly apiKey: string;
    private readonly apiKeyCollection: string;
    private readonly publishKey: string;
    private readonly cmsEmail: string;
    private readonly cmsPassword: string;
    private readonly outputBucketName: string;
    private readonly outputBucketPrefix: string;
    private readonly outputBucketClient: S3Client | null;
    private jwtToken: string | null = null;
    private jwtExpEpochSec = 0;

    constructor(private readonly config: ConfigService) {
        const configured =
            this.config.get<string>('PAYLOAD_CMS_URL') ||
            this.config.get<string>('CMS_API_URL') ||
            'https://cms.tokenomics.net';
        this.cmsBaseUrl = configured.replace(/\/api\/?$/, '').replace(/\/+$/, '');
        this.apiKey = this.config.get<string>('PAYLOAD_API_KEY') || '';
        this.apiKeyCollection =
            this.config.get<string>('PAYLOAD_API_KEY_COLLECTION') ||
            'payload-mcp-api-keys';
        this.publishKey = this.config.get<string>('AGENT_PUBLISH_KEY') || '';
        this.cmsEmail = this.config.get<string>('CMS_EMAIL') || '';
        this.cmsPassword = this.config.get<string>('CMS_PASSWORD') || '';

        this.outputBucketName = this.config.get<string>('OUTPUT_BUCKET_NAME') || '';
        this.outputBucketPrefix = (this.config.get<string>('OUTPUT_BUCKET_PREFIX') || 'tokenomics-output')
            .replace(/^\/+|\/+$/g, '');

        const outputBucketEndpoint = this.config.get<string>('OUTPUT_BUCKET_ENDPOINT') || '';
        const outputBucketRegion = this.config.get<string>('OUTPUT_BUCKET_REGION') || 'auto';
        const outputBucketAccessKeyId = this.config.get<string>('OUTPUT_BUCKET_ACCESS_KEY_ID') || '';
        const outputBucketSecretAccessKey = this.config.get<string>('OUTPUT_BUCKET_SECRET_ACCESS_KEY') || '';

        const outputBucketConfigured =
            !!this.outputBucketName &&
            !!outputBucketEndpoint &&
            !!outputBucketAccessKeyId &&
            !!outputBucketSecretAccessKey;

        this.outputBucketClient = outputBucketConfigured
            ? new S3Client({
                region: outputBucketRegion,
                endpoint: outputBucketEndpoint,
                forcePathStyle: true,
                credentials: {
                    accessKeyId: outputBucketAccessKeyId,
                    secretAccessKey: outputBucketSecretAccessKey,
                },
            })
            : null;
    }

    validatePublishKey(provided?: string) {
        if (!this.publishKey) return;
        if (!provided || provided !== this.publishKey) {
            throw new UnauthorizedException('Invalid agent publish key');
        }
    }

    async publishDraft(input: CmsPublishRequest) {
        const existing = await this.findPostBySlug(input.slug);
        if (existing?.id) {
            return {
                success: true,
                postId: existing.id,
                slug: existing.slug || input.slug,
                status: existing.status || 'draft',
                runId: input.runId || null,
                message: `Draft already exists at ${this.cmsBaseUrl}/admin/collections/posts/${existing.id}`,
            };
        }

        const contentRaw = this.loadContent(input);
        const normalizedContent = this.normalizeMdxContent(contentRaw);

        if (!normalizedContent || normalizedContent.trim().length < 400) {
            throw new Error('Normalized blog content is missing or too short for CMS publish');
        }

        if (normalizedContent.length > 250_000) {
            throw new Error(
                `Normalized content too large for CMS publish (${normalizedContent.length} chars).`,
            );
        }

        let heroMediaId: string | null = null;
        if (input.heroImageObjectKey) {
            try {
                const { buffer, fileName } = await this.downloadOutputArtifact(input.heroImageObjectKey);
                heroMediaId = await this.uploadMediaBuffer(buffer, fileName, `${input.slug}-hero`);
            } catch {
                // Fall through to filesystem-path handling.
            }
        }

        if (!heroMediaId && input.heroImagePath && fs.existsSync(input.heroImagePath)) {
            const heroUploadPath = this.resolvePreferredUploadPath(input.heroImagePath);
            heroMediaId = await this.uploadMedia(heroUploadPath, `${input.slug}-hero`);
        }

        let ogMediaId: string | null = null;
        if (input.ogImageObjectKey) {
            try {
                const { buffer, fileName } = await this.downloadOutputArtifact(input.ogImageObjectKey);
                ogMediaId = await this.uploadMediaBuffer(buffer, fileName, `${input.slug}-og`);
            } catch {
                // Fall through to filesystem-path handling.
            }
        }

        if (!ogMediaId && input.ogImagePath && fs.existsSync(input.ogImagePath)) {
            const ogUploadPath = this.resolvePreferredUploadPath(input.ogImagePath);
            ogMediaId = await this.uploadMedia(ogUploadPath, `${input.slug}-og`);
        }

        const safeTitle = this.normalizeTitle(input.title, input.slug);

        const postData: Record<string, unknown> = {
            title: safeTitle,
            slug: input.slug,
            status: 'draft',
            content: normalizedContent,
            excerpt: input.excerpt,
            publishedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        if (heroMediaId) postData.heroImage = heroMediaId;
        if (ogMediaId) postData.ogImage = ogMediaId;

        const result = await this.cmsRequest('POST', '/api/posts', postData);

        return {
            success: true,
            postId: result?.doc?.id,
            slug: result?.doc?.slug || input.slug,
            status: 'draft',
            runId: input.runId || null,
            message: `Draft created at ${this.cmsBaseUrl}/admin/collections/posts/${result?.doc?.id}`,
        };
    }

    private normalizeTitle(rawTitle: string, slug?: string): string {
        const fallback = (slug || 'Untitled Post')
            .replace(/[-_]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const base = (rawTitle || fallback)
            .replace(/\s+/g, ' ')
            .trim();

        if (base.length <= 80) {
            return base;
        }

        // Trim to a word boundary to avoid hard-cut ugly titles in CMS.
        const candidate = base.slice(0, 80);
        const boundary = candidate.lastIndexOf(' ');
        const trimmed = (boundary >= 55 ? candidate.slice(0, boundary) : candidate)
            .replace(/[\s:;,.-]+$/g, '')
            .trim();

        return trimmed || candidate.trim() || fallback.slice(0, 80);
    }

    private async findPostBySlug(slug: string): Promise<any | null> {
        if (!slug?.trim()) return null;

        try {
            const encoded = encodeURIComponent(slug.trim());
            const response = await this.cmsRequest('GET', `/api/posts?where[slug][equals]=${encoded}&limit=1`);
            const docs = Array.isArray(response?.docs) ? response.docs : [];
            return docs[0] || null;
        } catch {
            return null;
        }
    }

    private loadContent(input: CmsPublishRequest): string {
        // Railway-safe path: prefer inline content because API and agents may not share a filesystem.
        if (typeof input.content === 'string' && input.content.trim().length > 0) {
            return input.content;
        }

        if (input.contentPath) {
            const resolved = path.resolve(input.contentPath);
            if (!fs.existsSync(resolved)) {
                throw new Error(`contentPath does not exist: ${resolved}`);
            }
            return fs.readFileSync(resolved, 'utf-8');
        }

        throw new Error('Neither contentPath nor inline content was provided');
    }

    private normalizeMdxContent(raw: string): string {
        let text = raw.trim();

        // Remove enclosing markdown code fences if present.
        text = text.replace(/^```(?:mdx|markdown)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

        const firstFrontmatterStart = text.indexOf('---\n');
        if (firstFrontmatterStart >= 0) {
            const firstFrontmatterEnd = text.indexOf('\n---', firstFrontmatterStart + 4);
            if (firstFrontmatterEnd > firstFrontmatterStart) {
                const bodyStart = firstFrontmatterEnd + 4;
                const secondFrontmatterMarker = text.indexOf('\n---\n', bodyStart);

                if (secondFrontmatterMarker > bodyStart) {
                    const lookahead = text.slice(secondFrontmatterMarker + 5, secondFrontmatterMarker + 120).toLowerCase();
                    if (lookahead.includes('title:') || lookahead.includes('slug:')) {
                        text = text.slice(0, secondFrontmatterMarker).trim();
                    }
                }
            }
        }

        // Remove obvious agent chatter if present after valid MDX section.
        const chatterMarkers = ['ALL_PASSED', 'NEEDS_MINOR_EDITS', 'NEEDS_REWRITE'];
        for (const marker of chatterMarkers) {
            const idx = text.indexOf(marker);
            if (idx > 1200) {
                text = text.slice(0, idx).trim();
            }
        }

        return text;
    }

    private detectMimeType(fileName: string): string {
        const ext = path.extname(fileName).toLowerCase();
        return ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : ext === '.png'
                ? 'image/png'
                : ext === '.webp'
                    ? 'image/webp'
                    : 'application/octet-stream';
    }

    private async uploadMediaBuffer(fileBuffer: Buffer, fileName: string, altText: string): Promise<string> {
        const mimeType = this.detectMimeType(fileName);
        const safeFileName = fileName || `upload-${Date.now()}.bin`;

        const boundary = `----FormBoundary${Date.now()}`;
        const safeAlt = altText?.trim() || path.parse(safeFileName).name;
        const payloadMeta = JSON.stringify({ alt: safeAlt, altText: safeAlt, title: safeAlt });
        const body = Buffer.concat([
            Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="_payload"\r\n\r\n${payloadMeta}\r\n`,
            ),
            Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="alt"\r\n\r\n${safeAlt}\r\n`,
            ),
            Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="altText"\r\n\r\n${safeAlt}\r\n`,
            ),
            Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\n${safeAlt}\r\n`,
            ),
            Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeFileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
            ),
            fileBuffer,
            Buffer.from(
                `\r\n--${boundary}--\r\n`,
            ),
        ]);

        const result = await this.cmsRequest(
            'POST',
            '/api/media',
            body,
            `multipart/form-data; boundary=${boundary}`,
        );

        return result?.doc?.id;
    }

    private async uploadMedia(filePath: string, altText: string): Promise<string> {
        const fileName = path.basename(filePath);
        const fileBuffer = fs.readFileSync(filePath);
        return this.uploadMediaBuffer(fileBuffer, fileName, altText);
    }

    private resolveOutputObjectKey(key: string): string {
        const trimmed = String(key || '').trim().replace(/^\/+/, '');
        if (!trimmed) return '';

        if (!this.outputBucketPrefix) return trimmed;
        if (trimmed.startsWith(`${this.outputBucketPrefix}/`)) return trimmed;
        return `${this.outputBucketPrefix}/${trimmed}`;
    }

    private async streamToBuffer(stream: any): Promise<Buffer> {
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
    }

    private async downloadOutputArtifact(objectKeyRaw: string): Promise<{ buffer: Buffer; fileName: string }> {
        if (!this.outputBucketClient || !this.outputBucketName) {
            throw new Error('Output bucket is not configured');
        }

        const objectKey = this.resolveOutputObjectKey(objectKeyRaw);
        if (!objectKey) {
            throw new Error('Output bucket object key is empty');
        }

        const response = await this.outputBucketClient.send(
            new GetObjectCommand({
                Bucket: this.outputBucketName,
                Key: objectKey,
            }),
        );

        const body: any = response.Body;
        if (!body) {
            throw new Error(`Empty object body for key ${objectKey}`);
        }

        const buffer = body.transformToByteArray
            ? Buffer.from(await body.transformToByteArray())
            : await this.streamToBuffer(body);

        return {
            buffer,
            fileName: path.basename(objectKey),
        };
    }
    private resolvePreferredUploadPath(originalPath: string): string {
        const resolved = path.resolve(originalPath);
        if (!fs.existsSync(resolved)) return resolved;

        const dir = path.dirname(resolved);
        const ext = path.extname(resolved).toLowerCase();
        const base = path.basename(resolved, ext);

        const candidates = [
            path.join(dir, `${base}-1200w.jpg`),
            path.join(dir, `${base}-1200w.webp`),
            path.join(dir, `${base}.jpg`),
            path.join(dir, `${base}.webp`),
            resolved,
        ].filter((p, i, arr) => arr.indexOf(p) === i && fs.existsSync(p));

        if (candidates.length === 1) {
            return candidates[0];
        }

        // Prefer the smallest existing candidate to avoid upstream payload limits.
        candidates.sort((a, b) => fs.statSync(a).size - fs.statSync(b).size);
        return candidates[0] || resolved;
    }

    private cmsRequest(
        method: string,
        apiPath: string,
        body?: any,
        contentType?: string,
    ): Promise<any> {
        const url = new URL(`${this.cmsBaseUrl}${apiPath}`);
        const client = url.protocol === 'https:' ? https : http;
        const bodyData =
            contentType?.includes('multipart')
                ? body
                : body
                    ? Buffer.from(JSON.stringify(body))
                    : null;

        return new Promise((resolve, reject) => {
            const doRequest = async () => {
                const authHeader = await this.resolveAuthHeader();
                const req = client.request(
                    url,
                    {
                        method,
                        headers: {
                            ...(authHeader ? { Authorization: authHeader } : {}),
                            'Content-Type': contentType || 'application/json',
                            ...(bodyData ? { 'Content-Length': bodyData.length } : {}),
                        },
                        timeout: 30_000,
                    },
                    (res) => {
                        let data = '';
                        res.on('data', (chunk) => {
                            data += chunk;
                        });
                        res.on('end', () => {
                            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                                try {
                                    resolve(JSON.parse(data));
                                } catch {
                                    resolve({ raw: data });
                                }
                                return;
                            }

                            reject(
                                new Error(`CMS API error ${res.statusCode}: ${String(data || '').slice(0, 600)}`),
                            );
                        });
                    },
                );

                req.on('error', (e) => reject(new Error(`CMS request failed: ${e.message}`)));
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('CMS request timeout'));
                });

                if (bodyData) req.write(bodyData);
                req.end();
            };

            void doRequest();
        });
    }

    private async resolveAuthHeader(): Promise<string | null> {
        if (this.apiKey) {
            return `${this.apiKeyCollection} API-Key ${this.apiKey}`;
        }

        if (!this.cmsEmail || !this.cmsPassword) {
            return null;
        }

        const now = Math.floor(Date.now() / 1000);
        if (this.jwtToken && this.jwtExpEpochSec - 30 > now) {
            return `JWT ${this.jwtToken}`;
        }

        const loginUrl = `${this.cmsBaseUrl}/api/users/login`;
        const result = await new Promise<any>((resolve, reject) => {
            const url = new URL(loginUrl);
            const client = url.protocol === 'https:' ? https : http;
            const body = Buffer.from(
                JSON.stringify({ email: this.cmsEmail, password: this.cmsPassword }),
            );

            const req = client.request(
                url,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': body.length,
                    },
                    timeout: 20_000,
                },
                (res) => {
                    let data = '';
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    res.on('end', () => {
                        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
                            reject(new Error(`CMS login failed ${res.statusCode}: ${data.slice(0, 400)}`));
                            return;
                        }

                        try {
                            resolve(JSON.parse(data));
                        } catch {
                            reject(new Error('CMS login response was not valid JSON'));
                        }
                    });
                },
            );

            req.on('error', (e) => reject(new Error(`CMS login request failed: ${e.message}`)));
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('CMS login request timeout'));
            });

            req.write(body);
            req.end();
        });

        const token = typeof result?.token === 'string' ? result.token : '';
        const exp = typeof result?.exp === 'number' ? result.exp : now + 300;
        if (!token) {
            throw new Error('CMS login did not return a token');
        }

        this.jwtToken = token;
        this.jwtExpEpochSec = exp;
        return `JWT ${token}`;
    }
}
