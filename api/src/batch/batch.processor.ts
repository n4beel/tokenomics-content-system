import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
    BLOG_BATCH_QUEUE,
    DAILY_NEWS_QUEUE,
    WEEKLY_BATCH_QUEUE,
} from './constants';
import { BatchJobData } from './batch.service';
import { AgentClientService } from '../agents/agent-client.service';
import { PrismaService } from '../prisma/prisma.service';
import { PostsService } from '../posts/posts.service';

abstract class BaseBatchProcessor extends WorkerHost {
    protected abstract readonly logger: Logger;

    constructor(
        protected readonly agentClient: AgentClientService,
        protected readonly prisma: PrismaService,
        protected readonly postsService: PostsService,
    ) {
        super();
    }

    protected async markRunning(job: Job<BatchJobData>) {
        const { batchId, type, triggeredBy } = job.data;

        await this.prisma.batchRun.upsert({
            where: { batchId },
            create: {
                batchId,
                type,
                status: 'running',
                triggeredBy,
                jobId: String(job.id),
                startedAt: new Date(),
            },
            update: { status: 'running', jobId: String(job.id) },
        });
    }

    protected async markCompleted(job: Job<BatchJobData>, result: any) {
        this.assertValidResult(job, result);

        const updated = await this.prisma.batchRun.update({
            where: { batchId: job.data.batchId },
            data: { status: 'completed', completedAt: new Date(), result },
        });

        if (job.data.type === 'weekly' && result) {
            const drafts = this.extractDrafts(result);
            if (drafts) {
                this.logger.log(`[${job.data.batchId}] Parsing drafts into post records...`);
                await this.postsService.createPostsFromBatch(updated.id, drafts);
            }
        }

        return result;
    }

    private parseJsonSafe(value: unknown): unknown {
        if (typeof value !== 'string') return value;
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }

    private collectToolFailures(result: any): string[] {
        if (!Array.isArray(result)) return [];

        const failures: string[] = [];

        for (const event of result) {
            const parts = event?.content?.parts;
            if (!Array.isArray(parts)) continue;

            for (const part of parts) {
                const fn = part?.functionResponse;
                if (!fn?.name) continue;

                const responsePayload = this.parseJsonSafe(fn.response);
                const nestedResult =
                    responsePayload && typeof responsePayload === 'object'
                        ? this.parseJsonSafe((responsePayload as any).result)
                        : null;

                const candidates = [responsePayload, nestedResult].filter(Boolean);

                for (const candidate of candidates) {
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

    private collectFinalState(result: any): Record<string, unknown> {
        const state: Record<string, unknown> = {};
        if (!Array.isArray(result)) return state;

        for (const event of result) {
            const delta = event?.actions?.stateDelta;
            if (delta && typeof delta === 'object') {
                for (const [key, value] of Object.entries(delta)) {
                    // Keep previously collected substantial values instead of overwriting
                    // them with empty-string placeholders from later model turns.
                    if (typeof value === 'string' && value.trim().length === 0) {
                        const existing = state[key];
                        if (typeof existing === 'string' && existing.trim().length > 0) {
                            continue;
                        }
                    }
                    state[key] = value;
                }
            }
        }

        return state;
    }

    private extractBlogOutputFallback(result: any): string {
        if (!Array.isArray(result)) return '';

        for (let i = result.length - 1; i >= 0; i--) {
            const event = result[i];
            const author = String(event?.author || '').toLowerCase();
            if (!author.includes('sam')) continue;

            const parts = event?.content?.parts;
            if (!Array.isArray(parts)) continue;

            const text = parts
                .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
                .join('\n')
                .trim();

            if (!text) continue;

            const looksLikeContent =
                /```mdx|^---|\bBLOG POST\b|\btitle:\b/i.test(text) &&
                text.length >= 1200;

            if (looksLikeContent) {
                return text;
            }
        }

        return '';
    }

    private extractBlogOutputFromPublishCalls(result: any): string {
        if (!Array.isArray(result)) return '';

        const candidates: string[] = [];

        for (const event of result) {
            const author = String(event?.author || '').toLowerCase();
            if (!author.includes('sam')) continue;

            const parts = event?.content?.parts;
            if (!Array.isArray(parts)) continue;

            for (const part of parts) {
                const call = part?.functionCall;
                if (!call || call.name !== 'publish_draft_to_cms') continue;

                const content = typeof call?.args?.content === 'string' ? call.args.content : '';
                if (!content) continue;

                const looksLikeMdx = /(^---\n[\s\S]+?\n---\n)|\btitle:\b/i.test(content);
                if (looksLikeMdx && content.trim().length >= 400) {
                    candidates.push(content.trim());
                }
            }
        }

        if (candidates.length === 0) return '';

        // Keep deterministic ordering and avoid duplicates.
        const unique = [...new Set(candidates)];
        return unique.join('\n\n<!-- NEXT_POST -->\n\n');
    }

    private extractQaVerdict(value: unknown): string {
        const parsed = this.parseJsonSafe(value);

        if (typeof parsed === 'string') {
            return parsed;
        }

        if (parsed && typeof parsed === 'object') {
            const verdict = (parsed as any).verdict;
            if (typeof verdict === 'string') {
                return verdict;
            }
        }

        return '';
    }

    private assertValidResult(job: Job<BatchJobData>, result: any) {
        const failures = this.collectToolFailures(result);
        if (failures.length > 0) {
            throw new Error(`Pipeline tool failures detected: ${failures.slice(0, 5).join(' | ')}`);
        }

        const finalState = this.collectFinalState(result);

        if (job.data.type === 'weekly') {
            const drafts = finalState.drafts;
            const qaOutput = typeof finalState.qa_result === 'string' ? finalState.qa_result : '';
            const hasUsableDrafts =
                (typeof drafts === 'string' && drafts.trim().length >= 200) ||
                (Array.isArray(drafts) && drafts.length > 0) ||
                (!!drafts && typeof drafts === 'object' && Object.keys(drafts as Record<string, unknown>).length > 0);

            if (!hasUsableDrafts) {
                throw new Error('Weekly pipeline completed without usable drafts output');
            }
            if (!/ALL_PASSED/i.test(qaOutput)) {
                throw new Error('Weekly pipeline QA did not emit ALL_PASSED');
            }
            return;
        }

        if (job.data.type === 'blog') {
            const blogOutputFromState = typeof finalState.blog_output === 'string' ? finalState.blog_output : '';
            const blogOutput =
                blogOutputFromState && blogOutputFromState.trim().length >= 400
                    ? blogOutputFromState
                    : this.extractBlogOutputFallback(result) || this.extractBlogOutputFromPublishCalls(result);
            const qaOutput = this.extractQaVerdict(finalState.blog_qa_result);

            if (!blogOutput || blogOutput.trim().length < 400) {
                throw new Error('Blog pipeline completed without usable blog_output content');
            }

            const unresolvedQuestion = /would you like|do you want me|should i/i.test(blogOutput);
            if (unresolvedQuestion) {
                throw new Error('Blog pipeline output ended in unresolved follow-up question');
            }

            if (!/ALL_PASSED/i.test(qaOutput)) {
                throw new Error('Blog pipeline QA did not emit ALL_PASSED');
            }
        }
    }

    protected async markFailed(job: Job<BatchJobData>, err: unknown) {
        await this.prisma.batchRun.update({
            where: { batchId: job.data.batchId },
            data: {
                status: 'failed',
                completedAt: new Date(),
                error: String((err as any)?.message || err),
            },
        });
    }

    /**
     * Extract Quill's draft text from ADK event results.
     */
    private extractDrafts(result: any): unknown | null {
        if (!result) return null;

        if (Array.isArray(result)) {
            for (let i = result.length - 1; i >= 0; i--) {
                const delta = result[i]?.actions?.stateDelta;
                if (delta?.drafts) return delta.drafts;
            }
        }

        if (result?.drafts !== undefined) return result.drafts;
        return null;
    }
}

@Processor(WEEKLY_BATCH_QUEUE)
export class WeeklyBatchProcessor extends BaseBatchProcessor {
    protected readonly logger = new Logger(WeeklyBatchProcessor.name);

    constructor(
        agentClient: AgentClientService,
        prisma: PrismaService,
        postsService: PostsService,
    ) {
        super(agentClient, prisma, postsService);
    }

    async process(job: Job<BatchJobData>): Promise<any> {
        const { batchId, type, triggeredBy } = job.data;
        this.logger.log(
            `Processing job ${job.id}: ${type} (batch: ${batchId}, triggered by: ${triggeredBy})`,
        );

        await this.markRunning(job);

        try {
            await job.updateProgress(10);
            this.logger.log(`[${batchId}] Starting weekly batch pipeline...`);
            const result = await this.agentClient.runWeeklyPipeline(batchId);
            await job.updateProgress(100);
            return await this.markCompleted(job, result);
        } catch (err) {
            await this.markFailed(job, err);
            throw err;
        }
    }
}

@Processor(BLOG_BATCH_QUEUE)
export class BlogBatchProcessor extends BaseBatchProcessor {
    protected readonly logger = new Logger(BlogBatchProcessor.name);

    constructor(
        agentClient: AgentClientService,
        prisma: PrismaService,
        postsService: PostsService,
    ) {
        super(agentClient, prisma, postsService);
    }

    async process(job: Job<BatchJobData>): Promise<any> {
        const { batchId, type, triggeredBy } = job.data;
        this.logger.log(
            `Processing job ${job.id}: ${type} (batch: ${batchId}, triggered by: ${triggeredBy})`,
        );

        await this.markRunning(job);

        try {
            await job.updateProgress(10);
            this.logger.log(`[${batchId}] Starting blog pipeline...`);
            const result = await this.agentClient.runBlogPipeline(batchId);
            await job.updateProgress(100);
            return await this.markCompleted(job, result);
        } catch (err) {
            await this.markFailed(job, err);
            throw err;
        }
    }
}

@Processor(DAILY_NEWS_QUEUE)
export class DailyNewsProcessor extends BaseBatchProcessor {
    protected readonly logger = new Logger(DailyNewsProcessor.name);

    constructor(
        agentClient: AgentClientService,
        prisma: PrismaService,
        postsService: PostsService,
    ) {
        super(agentClient, prisma, postsService);
    }

    async process(job: Job<BatchJobData>): Promise<any> {
        const { batchId, type, triggeredBy } = job.data;
        this.logger.log(
            `Processing job ${job.id}: ${type} (batch: ${batchId}, triggered by: ${triggeredBy})`,
        );

        await this.markRunning(job);

        try {
            await job.updateProgress(10);
            this.logger.log(`[${batchId}] Starting daily news scan...`);
            const result = await this.agentClient.runDailyNewsScan(batchId);
            await job.updateProgress(100);
            return await this.markCompleted(job, { batchId, result });
        } catch (err) {
            await this.markFailed(job, err);
            throw err;
        }
    }
}
