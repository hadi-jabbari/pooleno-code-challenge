import { ConfigService } from '@nestjs/config';
import { OutboxRepository } from '../persistence/outbox.repository';
import { KafkaClientService } from './kafka.client';
import { OutboxPublisher } from './outbox.publisher';

describe('OutboxPublisher', () => {
  it('publishes unpublished rows then marks them published', async () => {
    const rows = [
      {
        id: 'ob-1',
        aggregateId: 'ord-1',
        eventType: 'order.accepted',
        payload: { symbol: 'BTC-IRT', eventId: 'ob-1' },
        createdAt: new Date(),
        publishedAt: null,
      },
    ];

    const outboxRepository = {
      claimUnpublished: jest.fn().mockResolvedValue(rows),
      markPublishedOne: jest.fn().mockResolvedValue(undefined),
    } as unknown as OutboxRepository;

    const send = jest.fn().mockResolvedValue(undefined);
    const kafka = {
      topics: { orderAccepted: 'order.accepted', orderDlq: 'order.accepted.dlq' },
      producer: { send },
      connectProducer: jest.fn().mockResolvedValue(undefined),
    } as unknown as KafkaClientService;

    const config = {
      get: (key: string) => {
        if (key === 'OUTBOX_POLL_INTERVAL_MS') return '1000';
        if (key === 'APP_ROLE') return 'api';
        return undefined;
      },
    } as ConfigService;

    const publisher = new OutboxPublisher(outboxRepository, kafka, config);
    await publisher.tick();

    expect(send).toHaveBeenCalledWith({
      topic: 'order.accepted',
      messages: [
        expect.objectContaining({
          key: 'BTC-IRT',
          value: JSON.stringify(rows[0]!.payload),
        }),
      ],
    });
    expect(outboxRepository.markPublishedOne).toHaveBeenCalledWith('ob-1');
  });
});
