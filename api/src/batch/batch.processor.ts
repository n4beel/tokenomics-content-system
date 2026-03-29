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
import { CompletionTrackerService } from './completion-tracker.service';

/**
 * Base processor handles BullMQ lifecycle only.
 * Validation, post creation, and completion logic live in BatchWebhookService,
 * which is called by BatchWebhookController when the agents push events back.
 */
abstract class BaseBatchProcessor extends WorkerHost {
    protected abstract readonly logger: Logger;

    constructor(
        protected readonly agentClient: AgentClientService,
        protected readonly prisma: PrismaService,
        protected readonly completionTracker: CompletionTrackerService,
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
}

@Processor(WEEKLY_BATCH_QUEUE)
export class WeeklyBatchProcessor extends BaseBatchProcessor {
    protected readonly logger = new Logger(WeeklyBatchProcessor.name);

    constructor(
        agentClient: AgentClientService,
        prisma: PrismaService,
        completionTracker: CompletionTrackerService,
    ) {
        super(agentClient, prisma, completionTracker);
    }

    async process(job: Job<BatchJobData>): Promise<any> {
        const { batchId, type, triggeredBy } = job.data;
        this.logger.log(
            `Processing job ${job.id}: ${type} (batch: ${batchId}, triggered by: ${triggeredBy})`,
        );

        await this.markRunning(job);

        try {
            await job.updateProgress(10);
            await this.agentClient.startWeeklyPipelineAsync(batchId);
            this.logger.log(`[${batchId}] Pipeline started — waiting for completion callback...`);
            const result = await this.completionTracker.wait(batchId, this.agentClient.requestTimeoutMs);
            await job.updateProgress(100);
            return result;
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
        completionTracker: CompletionTrackerService,
    ) {
        super(agentClient, prisma, completionTracker);
    }

    async process(job: Job<BatchJobData>): Promise<any> {
        const { batchId, type, triggeredBy } = job.data;
        this.logger.log(
            `Processing job ${job.id}: ${type} (batch: ${batchId}, triggered by: ${triggeredBy})`,
        );

        await this.markRunning(job);

        try {
            await job.updateProgress(10);
            await this.agentClient.startBlogPipelineAsync(batchId);
            this.logger.log(`[${batchId}] Pipeline started — waiting for completion callback...`);
            const result = await this.completionTracker.wait(batchId, this.agentClient.requestTimeoutMs);
            await job.updateProgress(100);
            return result;
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
        completionTracker: CompletionTrackerService,
    ) {
        super(agentClient, prisma, completionTracker);
    }

    async process(job: Job<BatchJobData>): Promise<any> {
        const { batchId, type, triggeredBy } = job.data;
        this.logger.log(
            `Processing job ${job.id}: ${type} (batch: ${batchId}, triggered by: ${triggeredBy})`,
        );

        await this.markRunning(job);

        try {
            await job.updateProgress(10);
            await this.agentClient.startDailyNewsScanAsync(batchId);
            this.logger.log(`[${batchId}] Pipeline started — waiting for completion callback...`);
            const result = await this.completionTracker.wait(batchId, this.agentClient.requestTimeoutMs);
            await job.updateProgress(100);
            return result;
        } catch (err) {
            await this.markFailed(job, err);
            throw err;
        }
    }
}
