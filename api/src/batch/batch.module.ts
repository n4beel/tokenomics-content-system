import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AgentsModule } from '../agents/agents.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PostsModule } from '../posts/posts.module';
import { SettingsModule } from '../settings/settings.module';
import { BatchService } from './batch.service';
import {
  BlogBatchProcessor,
  DailyNewsProcessor,
  WeeklyBatchProcessor,
} from './batch.processor';
import { BatchController } from './batch.controller';
import { BatchScheduler } from './batch.scheduler';
import {
  BLOG_BATCH_QUEUE,
  DAILY_NEWS_QUEUE,
  WEEKLY_BATCH_QUEUE,
} from './constants';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: WEEKLY_BATCH_QUEUE },
      { name: BLOG_BATCH_QUEUE },
      { name: DAILY_NEWS_QUEUE },
    ),
    AgentsModule,
    PrismaModule,
    PostsModule,
    SettingsModule,
  ],
  providers: [
    BatchService,
    WeeklyBatchProcessor,
    BlogBatchProcessor,
    DailyNewsProcessor,
    BatchScheduler,
  ],
  controllers: [BatchController],
  exports: [BatchService, BatchScheduler],
})
export class BatchModule { }
