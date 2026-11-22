import { Module } from '@nestjs/common';
import { KafkaClientService } from '../../infrastructure/messaging/kafka.client';
import { MockExternalApiService } from '../../infrastructure/messaging/mock-external-api.service';
import { OrderEventConsumer } from '../../infrastructure/messaging/order-event.consumer';
import { OutboxPublisher } from '../../infrastructure/messaging/outbox.publisher';
import { OutboxRepository } from '../../infrastructure/persistence/outbox.repository';
import { ProcessedEventRepository } from '../../infrastructure/persistence/processed-event.repository';

@Module({
  providers: [
    KafkaClientService,
    OutboxRepository,
    ProcessedEventRepository,
    MockExternalApiService,
    OutboxPublisher,
    OrderEventConsumer,
  ],
  exports: [
    KafkaClientService,
    MockExternalApiService,
    OutboxPublisher,
    OutboxRepository,
    ProcessedEventRepository,
  ],
})
export class MessagingModule {}
