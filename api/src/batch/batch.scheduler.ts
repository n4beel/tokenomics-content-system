import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { BatchService } from './batch.service';

@Injectable()
export class BatchScheduler {
  private readonly logger = new Logger(BatchScheduler.name);

  constructor(
    private readonly batchService: BatchService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Weekly batch trigger
   * Default: Saturday at 5:00 AM (configurable via BATCH_CRON env)
   * Cron annotation is the default; the actual schedule can be overridden
   * via the dashboard settings in the future.
   */
  @Cron('0 5 * * 6', { name: 'weekly-batch' })
  async handleWeeklyBatch() {
    this.logger.log('Scheduled weekly batch triggered');
    const { batchId, jobId } = await this.batchService.triggerWeeklyBatch(
      'scheduler',
    );
    this.logger.log(`Weekly batch queued: ${batchId} (job: ${jobId})`);
  }

  /**
   * Daily news scan
   * Runs every weekday at 7:00 AM
   */
  @Cron('0 7 * * 1-5', { name: 'daily-news-scan' })
  async handleDailyNewsScan() {
    this.logger.log('Scheduled daily news scan triggered');
    const { batchId, jobId } = await this.batchService.triggerDailyNewsScan();
    this.logger.log(`Daily news scan queued: ${batchId} (job: ${jobId})`);
  }
}
