import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { BatchService } from './batch.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class BatchScheduler implements OnModuleInit {
  private readonly logger = new Logger(BatchScheduler.name);

  constructor(
    private readonly batchService: BatchService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly settings: SettingsService,
  ) {}

  async onModuleInit() {
    await this.registerSchedules();
  }

  /**
   * Register cron jobs from DB settings.
   * Called on startup and after settings change via refresh endpoint.
   */
  async refreshSchedules() {
    // Delete existing jobs if they exist
    this.deleteCronIfExists('weekly-batch');
    this.deleteCronIfExists('daily-news-scan');

    await this.registerSchedules();
    this.logger.log('Cron schedules refreshed from DB settings');
  }

  private async registerSchedules() {
    const weeklyCron = await this.settings.getWeeklyCron();
    const dailyCron = await this.settings.getDailyNewsCron();

    // Weekly batch
    const weeklyJob = new CronJob(weeklyCron, () => this.handleWeeklyBatch());
    this.schedulerRegistry.addCronJob('weekly-batch', weeklyJob);
    weeklyJob.start();
    this.logger.log(`Registered dynamic cron 'weekly-batch': ${weeklyCron}`);

    // Daily news scan
    const dailyJob = new CronJob(dailyCron, () => this.handleDailyNewsScan());
    this.schedulerRegistry.addCronJob('daily-news-scan', dailyJob);
    dailyJob.start();
    this.logger.log(`Registered dynamic cron 'daily-news-scan': ${dailyCron}`);
  }

  private deleteCronIfExists(name: string) {
    try {
      const job = this.schedulerRegistry.getCronJob(name);
      job.stop();
      this.schedulerRegistry.deleteCronJob(name);
    } catch {
      // Job doesn't exist yet — fine
    }
  }

  private async handleWeeklyBatch() {
    this.logger.log('Scheduled weekly batch triggered');
    const { batchId, jobId } = await this.batchService.triggerWeeklyBatch(
      'scheduler',
    );
    this.logger.log(`Weekly batch queued: ${batchId} (job: ${jobId})`);
  }

  private async handleDailyNewsScan() {
    this.logger.log('Scheduled daily news scan triggered');
    const { batchId, jobId } = await this.batchService.triggerDailyNewsScan();
    this.logger.log(`Daily news scan queued: ${batchId} (job: ${jobId})`);
  }
}
