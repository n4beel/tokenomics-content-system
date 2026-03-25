import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AgentsModule } from '../agents/agents.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PostsModule } from '../posts/posts.module';
import { SettingsModule } from '../settings/settings.module';
import { BatchService } from './batch.service';
import { BatchProcessor } from './batch.processor';
import { BatchController } from './batch.controller';
import { BatchScheduler } from './batch.scheduler';
import { BATCH_QUEUE } from './constants';

@Module({
  imports: [
    BullModule.registerQueue({
      name: BATCH_QUEUE,
    }),
    AgentsModule,
    PrismaModule,
    PostsModule,
    SettingsModule,
  ],
  providers: [BatchService, BatchProcessor, BatchScheduler],
  controllers: [BatchController],
  exports: [BatchService, BatchScheduler],
})
export class BatchModule {}
