import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const PLATFORMS = ['linkedin', 'x', 'youtube'];

/**
 * Parses Quill's draft output into Post records.
 *
 * Handles three cases:
 * 1. drafts is already a parsed array (ADK outputSchema) → map directly
 * 2. drafts is a JSON string → JSON.parse then map
 * 3. drafts is freeform text → heuristic heading split (legacy fallback)
 */
function parseDraftsIntoSlots(drafts: any, batchRunId: string) {
  if (!drafts) return [];

  // Helper to map a post array into DB records
  const mapPosts = (arr: any[]) =>
    arr
      .filter((p: any) => p && typeof p.content === 'string' && p.content.length > 20)
      .map((p: any) => ({
        batchRunId,
        platform: (p.platform || 'linkedin').toLowerCase(),
        pillar: p.pillar || 'General',
        slot: (p.slot || 'monday').toLowerCase(),
        topic: (p.topic || p.content.split('\n')[0]).slice(0, 120),
        content: p.content,
        youtubeTitle: p.youtubeTitle || null,
        youtubeDescription: p.youtubeDescription || null,
        youtubeThumbnailBrief: p.youtubeThumbnailBrief || null,
        status: 'draft',
      }));

  // ── Case 1: Already a parsed array (from outputSchema) ──
  if (Array.isArray(drafts) && drafts.length > 0) {
    return mapPosts(drafts);
  }

  // From here, drafts must be a string
  if (typeof drafts !== 'string') {
    // If it's an object but not an array, try to see if it's wrapped
    if (typeof drafts === 'object') {
      const values = Object.values(drafts);
      const arr = values.find((v) => Array.isArray(v));
      if (arr) return mapPosts(arr as any[]);
    }
    return [];
  }

  // ── Case 2: JSON string ──
  const jsonStr = drafts
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return mapPosts(parsed);
    }
  } catch {
    // JSON parse failed — fall through to heuristic fallback
  }

  // ── Fallback: heuristic split for old format ──
  const sections = drafts
    .split(/\n(?=#+\s|---|\*\*[A-Z])/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 60);

  const posts = [];
  let slotIndex = 0;

  for (const section of sections) {
    const day = DAYS[slotIndex % DAYS.length];
    const platform =
      PLATFORMS[Math.floor(slotIndex / DAYS.length) % PLATFORMS.length];

    const lower = section.toLowerCase();
    let pillar = 'General';
    if (lower.includes('rwa') || lower.includes('tokeniz'))
      pillar = 'RWA Tokenization';
    else if (
      lower.includes('defi') ||
      lower.includes('aave') ||
      lower.includes('protocol')
    )
      pillar = 'Industry & DeFi';
    else if (
      lower.includes('news') ||
      lower.includes('mica') ||
      lower.includes('regulatory')
    )
      pillar = 'News & Intel';
    else if (
      lower.includes('builder') ||
      lower.includes('tokenomics') ||
      lower.includes('token design')
    )
      pillar = "Builder's Playbook";
    else if (
      lower.includes('fundamental') ||
      lower.includes('eip') ||
      lower.includes('ethereum')
    )
      pillar = 'Fundamentals';

    posts.push({
      batchRunId,
      platform,
      pillar,
      topic: section
        .split('\n')[0]
        .replace(/^#+\s*/, '')
        .slice(0, 120),
      content: section,
      slot: day,
      status: 'draft',
    });

    slotIndex++;
  }

  return posts;
}

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) { }

  /** Parse Quill drafts and persist as Post rows */
  async createPostsFromBatch(batchRunId: string, drafts: any): Promise<void> {
    const slots = parseDraftsIntoSlots(drafts, batchRunId);
    if (slots.length === 0) return;

    await this.prisma.post.createMany({ data: slots, skipDuplicates: true });
  }

  /** Get all posts for a batch, grouped by day slot */
  async getPostsByBatch(batchRunId: string) {
    return this.prisma.post.findMany({
      where: { batchRunId },
      orderBy: [{ slot: 'asc' }, { platform: 'asc' }],
    });
  }

  /** Get the most recent completed weekly batch runs */
  async getRecentBatchRuns(limit = 10) {
    return this.prisma.batchRun.findMany({
      where: { type: 'weekly' },
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: { _count: { select: { posts: true } } },
    });
  }

  /** Get approval summary for a batch */
  async getBatchSummary(batchRunId: string) {
    const counts = await this.prisma.post.groupBy({
      by: ['status'],
      where: { batchRunId },
      _count: true,
    });
    return counts.reduce(
      (acc, c) => ({ ...acc, [c.status]: c._count }),
      {} as Record<string, number>,
    );
  }

  /** Update a single post status (approve / reject / reset) */
  async updatePostStatus(postId: string, status: string, content?: string) {
    return this.prisma.post.update({
      where: { id: postId },
      data: { status, ...(content !== undefined ? { content } : {}) },
    });
  }

  /** Bulk approve all pending posts in a batch */
  async bulkApprove(batchRunId: string) {
    return this.prisma.post.updateMany({
      where: { batchRunId, status: 'draft' },
      data: { status: 'approved' },
    });
  }
}
