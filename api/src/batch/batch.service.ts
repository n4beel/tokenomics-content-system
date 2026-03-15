import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BATCH_QUEUE } from './constants';
import { v4 as uuidv4 } from 'uuid';

export interface BatchJobData {
  batchId: string;
  type: 'weekly' | 'daily-news' | 'reactive';
  triggeredBy: 'scheduler' | 'manual';
  triggeredAt: string;
}

@Injectable()
export class BatchService {
  private readonly logger = new Logger(BatchService.name);

  constructor(
    @InjectQueue(BATCH_QUEUE) private readonly batchQueue: Queue,
  ) {}

  /**
   * Queue a weekly batch job
   */
  async triggerWeeklyBatch(triggeredBy: 'scheduler' | 'manual' = 'manual') {
    const batchId = `batch-${uuidv4().slice(0, 8)}`;
    this.logger.log(`Triggering weekly batch: ${batchId} (by: ${triggeredBy})`);

    const job = await this.batchQueue.add('weekly-batch', {
      batchId,
      type: 'weekly',
      triggeredBy,
      triggeredAt: new Date().toISOString(),
    } as BatchJobData);

    return { batchId, jobId: job.id };
  }

  /**
   * Queue a daily news scan job
   */
  async triggerDailyNewsScan() {
    const batchId = `news-${uuidv4().slice(0, 8)}`;
    this.logger.log(`Triggering daily news scan: ${batchId}`);

    const job = await this.batchQueue.add('daily-news', {
      batchId,
      type: 'daily-news',
      triggeredBy: 'scheduler',
      triggeredAt: new Date().toISOString(),
    } as BatchJobData);

    return { batchId, jobId: job.id };
  }

  /**
   * Get the status of a batch job
   */
  async getBatchStatus(jobId: string) {
    const job = await this.batchQueue.getJob(jobId);
    if (!job) {
      return null;
    }

    return {
      jobId: job.id,
      data: job.data,
      status: await job.getState(),
      progress: job.progress,
      result: job.returnvalue,
      failedReason: job.failedReason,
      createdAt: new Date(job.timestamp),
    };
  }
}
