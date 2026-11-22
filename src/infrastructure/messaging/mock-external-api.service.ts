import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderAcceptedEventPayload } from '../persistence/order.repository';

/**
 * Simulates an external settlement / notification API.
 * Failure rate can be configured for retry/DLQ demos.
 */
@Injectable()
export class MockExternalApiService {
  private readonly logger = new Logger(MockExternalApiService.name);
  private readonly failureRate: number;
  private callCount = 0;

  constructor(config: ConfigService) {
    this.failureRate = Number(config.get<string>('MOCK_EXTERNAL_API_FAILURE_RATE') ?? 0);
  }

  async notifyOrderAccepted(event: OrderAcceptedEventPayload): Promise<void> {
    this.callCount += 1;

    if (this.failureRate > 0 && Math.random() < this.failureRate) {
      this.logger.warn(`Mock API failing for event ${event.eventId}`);
      throw new Error(`Mock external API failure for event ${event.eventId}`);
    }

    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, 5));
    this.logger.debug(`Mock API accepted event ${event.eventId} (call #${this.callCount})`);
  }

  getCallCount(): number {
    return this.callCount;
  }

  /** Test helper: force next N failures by temporarily raising rate to 1. */
  resetCallCount(): void {
    this.callCount = 0;
  }
}
