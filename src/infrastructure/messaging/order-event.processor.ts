import { Injectable, Logger } from '@nestjs/common';
import { OrderAcceptedEventPayload } from '../persistence/order.repository';
import { ProcessedEventRepository } from '../persistence/processed-event.repository';
import { MockExternalApiService } from './mock-external-api.service';

export type DlqReason = 'invalid_json' | 'missing_event_id' | 'processing_failed';

export interface ProcessResult {
  status: 'processed' | 'duplicate' | 'dlq';
  reason?: DlqReason;
}

@Injectable()
export class OrderEventProcessor {
  private readonly logger = new Logger(OrderEventProcessor.name);

  constructor(
    private readonly processedEvents: ProcessedEventRepository,
    private readonly mockApi: MockExternalApiService,
    private readonly maxRetries: number,
    private readonly retryBaseMs: number,
  ) {}

  async process(
    event: OrderAcceptedEventPayload,
    options?: { onDlq?: (reason: DlqReason) => Promise<void> },
  ): Promise<ProcessResult> {
    if (!event.eventId) {
      await options?.onDlq?.('missing_event_id');
      return { status: 'dlq', reason: 'missing_event_id' };
    }

    if (await this.processedEvents.isProcessed(event.eventId)) {
      return { status: 'duplicate' };
    }

    try {
      await this.processWithRetry(event);
      await this.processedEvents.tryMarkProcessed(event.eventId);
      return { status: 'processed' };
    } catch (error) {
      this.logger.error(`Processing failed for ${event.eventId}: ${String(error)}`);
      await options?.onDlq?.('processing_failed');
      await this.processedEvents.tryMarkProcessed(event.eventId);
      return { status: 'dlq', reason: 'processing_failed' };
    }
  }

  private async processWithRetry(event: OrderAcceptedEventPayload): Promise<void> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.maxRetries) {
      try {
        await this.mockApi.notifyOrderAccepted(event);
        return;
      } catch (error) {
        lastError = error;
        attempt += 1;
        if (attempt > this.maxRetries) {
          break;
        }
        const delay = this.retryBaseMs * 2 ** (attempt - 1);
        await sleep(delay);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
