import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { BATCH_QUEUE } from './constants';
import { BatchJobData } from './batch.service';
import { AgentClientService } from '../agents/agent-client.service';
import { PrismaService } from '../prisma/prisma.service';
import { PostsService } from '../posts/posts.service';

@Processor(BATCH_QUEUE)
export class BatchProcessor extends WorkerHost {
  private readonly logger = new Logger(BatchProcessor.name);

  constructor(
    private readonly agentClient: AgentClientService,
    private readonly prisma: PrismaService,
    private readonly postsService: PostsService,
  ) {
    super();
  }

  async process(job: Job<BatchJobData>): Promise<any> {
    const { batchId, type, triggeredBy } = job.data;
    this.logger.log(
      `Processing job ${job.id}: ${type} (batch: ${batchId}, triggered by: ${triggeredBy})`,
    );

    // Persist batch run record
    const batchRun = await this.prisma.batchRun.upsert({
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

    try {
      let result: any;
      switch (type) {
        case 'weekly':
          result = await this.processWeeklyBatch(job);
          break;
        case 'daily-news':
          result = await this.processDailyNews(job);
          break;
        default:
          throw new Error(`Unknown batch type: ${type}`);
      }

      const updated = await this.prisma.batchRun.update({
        where: { batchId },
        data: { status: 'completed', completedAt: new Date(), result },
      });

      // Parse Quill's drafts into structured Post records for weekly batches
      if (type === 'weekly' && result) {
        const drafts = this.extractDrafts(result);
        if (drafts) {
          this.logger.log(`[${batchId}] Parsing drafts into post records...`);
          await this.postsService.createPostsFromBatch(updated.id, drafts);
        }
      }

      return result;
    } catch (err: any) {
      await this.prisma.batchRun.update({
        where: { batchId },
        data: { status: 'failed', completedAt: new Date(), error: String(err?.message || err) },
      });
      throw err;
    }
  }

  /**
   * Extract Quill's draft text from the ADK pipeline result.
   * The result is an array of ADK events — find the last 'drafts' state delta.
   */
  private extractDrafts(result: any): string | null {
    if (!result) return null;

    // ADK /run returns array of events
    if (Array.isArray(result)) {
      // State deltas accumulate — find the last one with 'drafts'
      for (let i = result.length - 1; i >= 0; i--) {
        const delta = result[i]?.actions?.stateDelta;
        if (delta?.drafts) return delta.drafts;
      }
    }

    // Fallback: result might be a state object directly
    if (typeof result?.drafts === 'string') return result.drafts;

    return null;
  }

  private async processWeeklyBatch(job: Job<BatchJobData>) {
    const { batchId } = job.data;
    await job.updateProgress(10);
    this.logger.log(`[${batchId}] Starting weekly batch pipeline...`);
    const result = await this.agentClient.runWeeklyPipeline(batchId);
    await job.updateProgress(100);
    return result;
  }

  private async processDailyNews(job: Job<BatchJobData>) {
    const { batchId } = job.data;
    await job.updateProgress(10);
    this.logger.log(`[${batchId}] Starting daily news scan...`);
    const result = await this.agentClient.runDailyNewsScan(batchId);
    await job.updateProgress(100);
    return { batchId, result };
  }
}
