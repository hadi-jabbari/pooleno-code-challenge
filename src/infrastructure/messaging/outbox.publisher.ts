import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxRepository } from '../persistence/outbox.repository';
import { KafkaClientService } from './kafka.client';

@Injectable()
export class OutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisher.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly pollIntervalMs: number;
  private readonly enabled: boolean;

  constructor(
    private readonly outboxRepository: OutboxRepository,
    private readonly kafka: KafkaClientService,
    config: ConfigService,
  ) {
    this.pollIntervalMs = Number(config.get('OUTBOX_POLL_INTERVAL_MS') ?? 1000);
    const role = config.get<string>('APP_ROLE') ?? 'all';
    this.enabled = role === 'all' || role === 'api' || role === 'publisher';
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      return;
    }
    try {
      await this.kafka.connectProducer();
      this.timer = setInterval(() => {
        void this.tick();
      }, this.pollIntervalMs);
      this.logger.log(`Outbox publisher started (interval=${this.pollIntervalMs}ms)`);
    } catch (error) {
      this.logger.error(
        `Outbox publisher failed to start (will keep HTTP up): ${String(error)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Drain once more before exit
    if (this.enabled) {
      await this.tick();
    }
  }

  async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const rows = await this.outboxRepository.claimUnpublished(50);
      for (const row of rows) {
        const payload = row.payload as { symbol?: string };
        await this.kafka.producer.send({
          topic: this.kafka.topics.orderAccepted,
          messages: [
            {
              key: payload.symbol ?? row.aggregateId,
              value: JSON.stringify(row.payload),
              headers: {
                eventType: row.eventType,
                eventId: row.id,
              },
            },
          ],
        });
        await this.outboxRepository.markPublishedOne(row.id);
        this.logger.debug(`Published outbox event ${row.id}`);
      }
    } catch (error) {
      this.logger.error(`Outbox publish failed: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
