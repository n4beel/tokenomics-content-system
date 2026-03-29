import { Controller, Post, Param, Body, HttpCode } from '@nestjs/common';
import { BatchWebhookService } from './batch-webhook.service';

/**
 * Internal webhook endpoints — called by the agents service, not the dashboard.
 * No auth guard required (internal network only).
 */
@Controller('internal/batch')
export class BatchWebhookController {
  constructor(private readonly webhook: BatchWebhookService) {}

  /** Agents POST each ADK event here as it is emitted. */
  @Post(':batchId/event')
  @HttpCode(204)
  async handleEvent(@Param('batchId') batchId: string, @Body() event: unknown): Promise<void> {
    await this.webhook.appendEvent(batchId, event);
  }

  /** Agents POST here when the pipeline finishes without throwing. */
  @Post(':batchId/done')
  @HttpCode(204)
  async handleDone(@Param('batchId') batchId: string): Promise<void> {
    await this.webhook.handleDone(batchId);
  }

  /** Agents POST here when the pipeline throws an unhandled error. */
  @Post(':batchId/error')
  @HttpCode(204)
  async handleError(
    @Param('batchId') batchId: string,
    @Body() body: { error?: string },
  ): Promise<void> {
    await this.webhook.handleError(batchId, body?.error ?? 'Unknown pipeline error');
  }
}
