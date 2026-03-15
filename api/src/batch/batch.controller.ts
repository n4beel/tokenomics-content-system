import { Controller, Post, Get, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { BatchService } from './batch.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('batch')
export class BatchController {
  constructor(
    private readonly batchService: BatchService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * POST /batch/trigger/weekly
   * Manually trigger a weekly content batch (for testing)
   */
  @Post('trigger/weekly')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerWeeklyBatch() {
    const result = await this.batchService.triggerWeeklyBatch('manual');
    return {
      message: 'Weekly batch queued',
      ...result,
    };
  }

  /**
   * POST /batch/trigger/daily-news
   * Manually trigger a daily news scan (for testing)
   */
  @Post('trigger/daily-news')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerDailyNewsScan() {
    const result = await this.batchService.triggerDailyNewsScan();
    return {
      message: 'Daily news scan queued',
      ...result,
    };
  }

  @Get('runs')
  async getRuns() {
    return this.prisma.batchRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        batchId: true,
        type: true,
        status: true,
        triggeredBy: true,
        startedAt: true,
        completedAt: true,
        error: true,
        jobId: true,
      },
    });
  }

  @Get('runs/:batchId')
  async getRun(@Param('batchId') batchId: string) {
    return this.prisma.batchRun.findUniqueOrThrow({ where: { batchId } });
  }

  /**
   * GET /batch/status/:jobId
   * Get the status of a batch job
   */
  @Get('status/:jobId')
  async getBatchStatus(@Param('jobId') jobId: string) {
    const status = await this.batchService.getBatchStatus(jobId);
    if (!status) {
      return { error: 'Job not found' };
    }
    return status;
  }
}
