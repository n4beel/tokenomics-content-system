import {
  Controller,
  Post,
  Get,
  Param,
  HttpCode,
  HttpStatus,
  Body,
  Headers,
  HttpException,
  Query,
} from '@nestjs/common';
import { BatchService } from './batch.service';
import { BatchScheduler } from './batch.scheduler';
import { PrismaService } from '../prisma/prisma.service';
import { CmsPublishService, type CmsPublishRequest } from './cms-publish.service';

@Controller('batch')
export class BatchController {
  constructor(
    private readonly batchService: BatchService,
    private readonly batchScheduler: BatchScheduler,
    private readonly prisma: PrismaService,
    private readonly cmsPublishService: CmsPublishService,
  ) { }

  /**
   * POST /batch/refresh-schedules
   * Re-read cron expressions from DB and update the running schedules.
   * Called by the dashboard after saving settings.
   */
  @Post('refresh-schedules')
  @HttpCode(HttpStatus.OK)
  async refreshSchedules() {
    await this.batchScheduler.refreshSchedules();
    return { message: 'Cron schedules refreshed from DB settings' };
  }

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

  /**
   * POST /batch/trigger/blog
   * Manually trigger the blog pipeline (Riley -> Sam -> SamQA -> CMS draft)
   */
  @Post('trigger/blog')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerBlogBatch() {
    const result = await this.batchService.triggerBlogBatch('manual');
    return {
      message: 'Blog batch queued',
      ...result,
    };
  }

  private toPositiveInt(raw: string | undefined, fallback: number) {
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  }

  private normalizeTypeFilter(type?: string) {
    const normalized = String(type || '').trim().toLowerCase();
    if (!normalized || normalized === 'all') return null;
    if (normalized === 'daily_news') return 'daily-news';
    return normalized;
  }

  @Get('runs/stats')
  async getRunStats() {
    const [typeGroups, statusGroups, total] = await Promise.all([
      this.prisma.batchRun.groupBy({ by: ['type'], _count: true }),
      this.prisma.batchRun.groupBy({ by: ['status'], _count: true }),
      this.prisma.batchRun.count(),
    ]);

    return {
      total,
      byType: typeGroups.reduce<Record<string, number>>((acc, item) => {
        acc[item.type] = item._count;
        return acc;
      }, {}),
      byStatus: statusGroups.reduce<Record<string, number>>((acc, item) => {
        acc[item.status] = item._count;
        return acc;
      }, {}),
    };
  }

  @Get('runs')
  async getRuns(
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
  ) {
    const hasFilters =
      !!type || !!status || !!search || !!pageRaw || !!pageSizeRaw;

    if (!hasFilters) {
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

    const page = this.toPositiveInt(pageRaw, 1);
    const pageSize = Math.min(this.toPositiveInt(pageSizeRaw, 10), 100);
    const normalizedType = this.normalizeTypeFilter(type);
    const normalizedStatus = String(status || '').trim().toLowerCase();
    const normalizedSearch = String(search || '').trim();

    const where: any = {};

    if (normalizedType) {
      if (normalizedType === 'blog') {
        where.OR = [
          { type: { equals: 'blog', mode: 'insensitive' } },
          { type: { startsWith: 'blog', mode: 'insensitive' } },
          { batchId: { startsWith: 'blog-', mode: 'insensitive' } },
        ];
      } else if (normalizedType === 'daily-news') {
        where.OR = [
          { type: { equals: 'daily-news', mode: 'insensitive' } },
          { type: { equals: 'daily_news', mode: 'insensitive' } },
          { batchId: { startsWith: 'news-', mode: 'insensitive' } },
        ];
      } else {
        where.type = { equals: normalizedType, mode: 'insensitive' };
      }
    }

    if (normalizedStatus && normalizedStatus !== 'all') {
      where.status = { equals: normalizedStatus, mode: 'insensitive' };
    }

    if (normalizedSearch) {
      const searchWhere = {
        OR: [
          { batchId: { contains: normalizedSearch, mode: 'insensitive' } },
          { type: { contains: normalizedSearch, mode: 'insensitive' } },
          { status: { contains: normalizedSearch, mode: 'insensitive' } },
          { triggeredBy: { contains: normalizedSearch, mode: 'insensitive' } },
          { error: { contains: normalizedSearch, mode: 'insensitive' } },
        ],
      };

      where.AND = where.AND ? [...where.AND, searchWhere] : [searchWhere];
    }

    const [items, total] = await Promise.all([
      this.prisma.batchRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
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
      }),
      this.prisma.batchRun.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
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

  /**
   * POST /batch/cms-publish-draft
   * Internal endpoint used by agent tools to offload CMS publishing.
   */
  @Post('cms-publish-draft')
  @HttpCode(HttpStatus.OK)
  async publishDraftToCms(
    @Body() body: CmsPublishRequest,
    @Headers('x-agent-publish-key') publishKey?: string,
  ) {
    try {
      this.cmsPublishService.validatePublishKey(publishKey);
      return await this.cmsPublishService.publishDraft(body);
    } catch (error: any) {
      throw new HttpException(
        {
          message: 'CMS publish failed',
          detail: String(error?.message || error),
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
