import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EachMessagePayload } from 'kafkajs';
import { OrderAcceptedEventPayload } from '../persistence/order.repository';
import { ProcessedEventRepository } from '../persistence/processed-event.repository';
import { KafkaClientService } from './kafka.client';
import { MockExternalApiService } from './mock-external-api.service';
import { OrderEventProcessor } from './order-event.processor';

@Injectable()
export class OrderEventConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderEventConsumer.name);
  private readonly enabled: boolean;
  private readonly processor: OrderEventProcessor;
  private stopping = false;

  constructor(
    private readonly kafka: KafkaClientService,
    processedEvents: ProcessedEventRepository,
    mockApi: MockExternalApiService,
    config: ConfigService,
  ) {
    const role = config.get<string>('APP_ROLE') ?? 'all';
    this.enabled = role === 'all' || role === 'worker' || role === 'consumer';
    this.processor = new OrderEventProcessor(
      processedEvents,
      mockApi,
      this.kafka.maxRetries,
      this.kafka.retryBaseMs,
    );
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log('Order event consumer disabled for this APP_ROLE');
      return;
    }

    try {
      await this.kafka.connectConsumer();
      await this.kafka.connectProducer();
      await this.kafka.consumer.subscribe({
        topic: this.kafka.topics.orderAccepted,
        fromBeginning: false,
      });

      await this.kafka.consumer.run({
        autoCommit: false,
        eachMessage: async (payload) => {
          if (this.stopping) {
            return;
          }
          await this.handleMessage(payload);
        },
      });

      this.logger.log(`Consuming topic ${this.kafka.topics.orderAccepted}`);
    } catch (error) {
      this.logger.error(
        `Order event consumer failed to start (will keep HTTP up): ${String(error)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;
    const raw = message.value?.toString();
    if (!raw) {
      await this.commit(payload);
      return;
    }

    let event: OrderAcceptedEventPayload;
    try {
      event = JSON.parse(raw) as OrderAcceptedEventPayload;
    } catch {
      this.logger.error(`Invalid JSON on ${topic}/${partition}@${message.offset}`);
      await this.publishDlq(raw, 'invalid_json');
      await this.commit(payload);
      return;
    }

    const eventId = event.eventId ?? message.headers?.eventId?.toString();
    if (!eventId) {
      this.logger.error('Missing eventId; sending to DLQ');
      await this.publishDlq(raw, 'missing_event_id');
      await this.commit(payload);
      return;
    }
    event.eventId = eventId;

    const result = await this.processor.process(event, {
      onDlq: async (reason) => this.publishDlq(raw, reason),
    });

    if (result.status === 'duplicate') {
      this.logger.debug(`Duplicate event ${eventId}; committing offset`);
    }

    await this.commit(payload);
  }

  private async publishDlq(raw: string, reason: string): Promise<void> {
    await this.kafka.producer.send({
      topic: this.kafka.topics.orderDlq,
      messages: [
        {
          value: raw,
          headers: { reason },
        },
      ],
    });
  }

  private async commit(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;
    await this.kafka.consumer.commitOffsets([
      {
        topic,
        partition,
        offset: (Number(message.offset) + 1).toString(),
      },
    ]);
  }
}
