import {
  Controller, Get, Patch, Post,
  Param, Body, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { PostsService } from './posts.service';

@UseGuards(JwtAuthGuard)
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  /** GET /api/posts/batch/:batchRunId */
  @Get('batch/:batchRunId')
  getByBatch(@Param('batchRunId') batchRunId: string) {
    return this.postsService.getPostsByBatch(batchRunId);
  }

  /** GET /api/posts/batch/:batchRunId/summary */
  @Get('batch/:batchRunId/summary')
  getSummary(@Param('batchRunId') batchRunId: string) {
    return this.postsService.getBatchSummary(batchRunId);
  }

  /** PATCH /api/posts/:id — update status or content */
  @Patch(':id')
  updatePost(
    @Param('id') id: string,
    @Body() body: { status?: string; content?: string },
  ) {
    return this.postsService.updatePostStatus(id, body.status!, body.content);
  }

  /** POST /api/posts/batch/:batchRunId/bulk-approve */
  @Post('batch/:batchRunId/bulk-approve')
  @HttpCode(HttpStatus.OK)
  bulkApprove(@Param('batchRunId') batchRunId: string) {
    return this.postsService.bulkApprove(batchRunId);
  }

  /** GET /api/posts/runs/recent */
  @Get('runs/recent')
  recentRuns() {
    return this.postsService.getRecentBatchRuns();
  }
}
