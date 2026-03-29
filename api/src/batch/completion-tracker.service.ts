import { Injectable, Logger } from '@nestjs/common';

/**
 * Tracks pending async pipeline completions.
 * BatchProcessor starts a run and calls wait(batchId).
 * BatchWebhookService calls complete() or fail() when the agents push a done/error callback.
 */
@Injectable()
export class CompletionTrackerService {
  private readonly logger = new Logger(CompletionTrackerService.name);
  private readonly pending = new Map<
    string,
    { resolve: (result: unknown[]) => void; reject: (err: Error) => void }
  >();

  wait(batchId: string, timeoutMs: number): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(batchId)) {
          reject(
            new Error(
              `Pipeline timed out after ${Math.round(timeoutMs / 60_000)}m (batchId: ${batchId})`,
            ),
          );
        }
      }, timeoutMs);

      this.pending.set(batchId, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  complete(batchId: string, result: unknown[]): void {
    const entry = this.pending.get(batchId);
    if (entry) {
      this.pending.delete(batchId);
      entry.resolve(result);
    } else {
      this.logger.warn(`complete() called for ${batchId} but no waiter found (already resolved?)`);
    }
  }

  fail(batchId: string, error: string): void {
    const entry = this.pending.get(batchId);
    if (entry) {
      this.pending.delete(batchId);
      entry.reject(new Error(error));
    } else {
      this.logger.warn(`fail() called for ${batchId} but no waiter found`);
    }
  }

  isWaiting(batchId: string): boolean {
    return this.pending.has(batchId);
  }
}
