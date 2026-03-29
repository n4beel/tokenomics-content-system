import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PostsService } from '../posts/posts.service';
import { CompletionTrackerService } from './completion-tracker.service';

/**
 * Handles push events from the agents service.
 * Stores traces progressively in DB and signals the waiting BullMQ job
 * via CompletionTrackerService when the pipeline finishes or fails.
 */
@Injectable()
export class BatchWebhookService {
  private readonly logger = new Logger(BatchWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly postsService: PostsService,
    private readonly completionTracker: CompletionTrackerService,
  ) {}

  // ── Public handlers ───────────────────────────────────────────────────────

  async appendEvent(batchId: string, event: unknown): Promise<void> {
    try {
      const run = await this.prisma.batchRun.findUnique({
        where: { batchId },
        select: { result: true },
      });
      if (!run) return;

      const current = Array.isArray(run.result) ? (run.result as unknown[]) : [];
      current.push(event);

      await this.prisma.batchRun.update({
        where: { batchId },
        data: { result: current as any },
      });
    } catch (err) {
      // Non-fatal — don't break the pipeline over a storage hiccup
      this.logger.warn(`appendEvent failed for ${batchId}: ${err}`);
    }
  }

  async handleDone(batchId: string): Promise<void> {
    const run = await this.prisma.batchRun.findUnique({ where: { batchId } });
    if (!run) {
      this.logger.warn(`handleDone: no BatchRun found for batchId=${batchId}`);
      return;
    }

    const traces = (run.result as unknown[]) ?? [];
    this.logger.log(`[${batchId}] Pipeline done — validating ${traces.length} events...`);

    try {
      this.assertValidResult(run.type, traces);

      const updated = await this.prisma.batchRun.update({
        where: { batchId },
        data: { status: 'completed', completedAt: new Date() },
      });

      if (run.type === 'weekly') {
        const drafts = this.extractDrafts(traces);
        if (drafts) {
          this.logger.log(`[${batchId}] Creating post records from drafts...`);
          await this.postsService.createPostsFromBatch(updated.id, drafts);
        }
      }

      this.logger.log(`[${batchId}] Batch completed successfully`);
      this.completionTracker.complete(batchId, traces);
    } catch (err) {
      const error = String((err as any)?.message ?? err);
      this.logger.error(`[${batchId}] Validation failed: ${error}`);

      await this.prisma.batchRun.update({
        where: { batchId },
        data: { status: 'failed', completedAt: new Date(), error },
      });

      this.completionTracker.fail(batchId, error);
    }
  }

  async handleError(batchId: string, error: string): Promise<void> {
    this.logger.error(`[${batchId}] Pipeline error from agents: ${error}`);

    try {
      await this.prisma.batchRun.update({
        where: { batchId },
        data: { status: 'failed', completedAt: new Date(), error },
      });
    } catch {
      // BatchRun might not exist yet if the error came before markRunning
    }

    this.completionTracker.fail(batchId, error);
  }

  // ── Validation (ported from BaseBatchProcessor) ───────────────────────────

  private parseJsonSafe(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  private collectToolFailures(result: unknown[]): string[] {
    const failures: string[] = [];
    for (const event of result) {
      const parts = (event as any)?.content?.parts;
      if (!Array.isArray(parts)) continue;
      for (const part of parts) {
        const fn = (part as any)?.functionResponse;
        if (!fn?.name) continue;
        const responsePayload = this.parseJsonSafe(fn.response);
        const nestedResult =
          responsePayload && typeof responsePayload === 'object'
            ? this.parseJsonSafe((responsePayload as any).result)
            : null;
        for (const candidate of [responsePayload, nestedResult].filter(Boolean)) {
          if (!candidate || typeof candidate !== 'object') continue;
          const success = (candidate as any).success;
          const error = (candidate as any).error;
          if (success === false || (typeof error === 'string' && error.length > 0)) {
            failures.push(`${fn.name}: ${error || 'tool returned success=false'}`);
            break;
          }
        }
      }
    }
    return failures;
  }

  private collectFinalState(result: unknown[]): Record<string, unknown> {
    const state: Record<string, unknown> = {};
    for (const event of result) {
      const delta = (event as any)?.actions?.stateDelta;
      if (delta && typeof delta === 'object') {
        for (const [key, value] of Object.entries(delta)) {
          if (typeof value === 'string' && value.trim().length === 0) {
            const existing = state[key];
            if (typeof existing === 'string' && existing.trim().length > 0) continue;
          }
          state[key] = value;
        }
      }
    }
    return state;
  }

  private findAnyAllPassed(result: unknown[]): boolean {
    for (const event of result) {
      const delta = (event as any)?.actions?.stateDelta;
      if (!delta) continue;
      const qaRaw = delta.qa_result;
      const qaStr =
        typeof qaRaw === 'string'
          ? qaRaw
          : typeof qaRaw === 'object' && qaRaw
            ? JSON.stringify(qaRaw)
            : '';
      if (/ALL_PASSED/i.test(qaStr)) return true;
    }
    return false;
  }

  private isSubstantialDrafts(drafts: unknown): boolean {
    if (!Array.isArray(drafts) || drafts.length === 0) return false;
    const realPosts = (drafts as any[]).filter(
      (p: any) =>
        p && typeof p.content === 'string' && p.content.length > 50 && !/ALL_PASSED/i.test(p.content),
    );
    return realPosts.length >= 5;
  }

  extractDrafts(result: unknown[]): unknown | null {
    const parseDrafts = (raw: unknown): unknown => {
      if (Array.isArray(raw)) return raw;
      if (typeof raw === 'string') {
        // Strip markdown fences if present
        const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        try { return JSON.parse(cleaned); } catch { return null; }
      }
      return null;
    };

    for (let i = result.length - 1; i >= 0; i--) {
      const delta = (result[i] as any)?.actions?.stateDelta;
      if (!delta?.drafts) continue;
      const drafts = parseDrafts(delta.drafts);
      if (this.isSubstantialDrafts(drafts)) return drafts;
    }
    // Fallback — return whatever is there, let assertValidResult reject it with a clear error
    for (let i = result.length - 1; i >= 0; i--) {
      const delta = (result[i] as any)?.actions?.stateDelta;
      if (!delta?.drafts) continue;
      const drafts = parseDrafts(delta.drafts);
      if (drafts) return drafts;
    }
    return null;
  }

  private extractBlogOutputFallback(result: unknown[]): string {
    for (let i = result.length - 1; i >= 0; i--) {
      const event = result[i] as any;
      const author = String(event?.author || '').toLowerCase();
      if (!author.includes('sam')) continue;
      const parts = event?.content?.parts;
      if (!Array.isArray(parts)) continue;
      const text = parts
        .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
        .join('\n')
        .trim();
      if (!text) continue;
      if (/```mdx|^---|\bBLOG POST\b|\btitle:\b/i.test(text) && text.length >= 1200) return text;
    }
    return '';
  }

  private extractBlogOutputFromPublishCalls(result: unknown[]): string {
    const candidates: string[] = [];
    for (const event of result) {
      const author = String((event as any)?.author || '').toLowerCase();
      if (!author.includes('sam')) continue;
      const parts = (event as any)?.content?.parts;
      if (!Array.isArray(parts)) continue;
      for (const part of parts) {
        const call = (part as any)?.functionCall;
        if (!call || call.name !== 'publish_draft_to_cms') continue;
        const content = typeof call?.args?.content === 'string' ? call.args.content : '';
        if (!content) continue;
        if (/(^---\n[\s\S]+?\n---\n)|\btitle:\b/i.test(content) && content.trim().length >= 400) {
          candidates.push(content.trim());
        }
      }
    }
    if (candidates.length === 0) return '';
    return [...new Set(candidates)].join('\n\n<!-- NEXT_POST -->\n\n');
  }

  private extractQaVerdict(value: unknown): string {
    const parsed = this.parseJsonSafe(value);
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed === 'object') {
      const verdict = (parsed as any).verdict;
      if (typeof verdict === 'string') return verdict;
    }
    return '';
  }

  private assertValidResult(type: string, result: unknown[]): void {
    const failures = this.collectToolFailures(result);
    if (failures.length > 0) {
      throw new Error(`Pipeline tool failures detected: ${failures.slice(0, 5).join(' | ')}`);
    }

    if (type === 'weekly') {
      const drafts = this.extractDrafts(result);
      const isRealArray = Array.isArray(drafts) && (drafts as any[]).length > 0;
      const postsWithContent = isRealArray
        ? (drafts as any[]).filter(
            (p: any) =>
              p && typeof p.content === 'string' && p.content.length > 50 && !/ALL_PASSED/i.test(p.content),
          )
        : [];

      if (!isRealArray || postsWithContent.length < 10) {
        throw new Error(
          `Weekly pipeline produced insufficient post content. ` +
            `Got ${isRealArray ? (drafts as any[]).length : 0} items, ${postsWithContent.length} with real content (need ≥10).`,
        );
      }
      if (!this.findAnyAllPassed(result)) {
        throw new Error('Weekly pipeline QA did not emit ALL_PASSED');
      }
      return;
    }

    if (type === 'blog') {
      const finalState = this.collectFinalState(result);
      const blogOutputFromState =
        typeof finalState.blog_output === 'string' ? finalState.blog_output : '';
      const blogOutput =
        blogOutputFromState && blogOutputFromState.trim().length >= 400
          ? blogOutputFromState
          : this.extractBlogOutputFallback(result) || this.extractBlogOutputFromPublishCalls(result);
      const qaOutput = this.extractQaVerdict(finalState.blog_qa_result);

      if (!blogOutput || blogOutput.trim().length < 400) {
        throw new Error('Blog pipeline completed without usable blog_output content');
      }
      if (/would you like|do you want me|should i/i.test(blogOutput)) {
        throw new Error('Blog pipeline output ended in unresolved follow-up question');
      }
      if (!/ALL_PASSED/i.test(qaOutput)) {
        throw new Error('Blog pipeline QA did not emit ALL_PASSED');
      }
    }
  }
}
