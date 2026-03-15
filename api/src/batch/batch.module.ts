import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AgentsModule } from '../agents/agents.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PostsModule } from '../posts/posts.module';
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
  ],
  providers: [BatchService, BatchProcessor, BatchScheduler],
  controllers: [BatchController],
  exports: [BatchService],
})
export class BatchModule {}

