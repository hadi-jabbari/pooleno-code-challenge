import { OrderAcceptedEventPayload } from '../persistence/order.repository';
import { ProcessedEventRepository } from '../persistence/processed-event.repository';
import { MockExternalApiService } from './mock-external-api.service';
import { OrderEventProcessor } from './order-event.processor';

describe('OrderEventProcessor', () => {
  const event: OrderAcceptedEventPayload = {
    eventId: 'evt-1',
    orderId: 'ord-1',
    symbol: 'BTC-IRT',
    side: 'BUY',
    price: 100,
    quantity: 1,
    remainingQuantity: 0,
    status: 'FILLED',
    tradeIds: [],
    occurredAt: new Date().toISOString(),
  };

  let processed: Set<string>;
  let processedRepo: jest.Mocked<ProcessedEventRepository>;
  let mockApi: { notifyOrderAccepted: jest.Mock };
  let processor: OrderEventProcessor;

  beforeEach(() => {
    processed = new Set();
    processedRepo = {
      isProcessed: jest.fn(async (id: string) => processed.has(id)),
      tryMarkProcessed: jest.fn(async (id: string) => {
        if (processed.has(id)) {
          return false;
        }
        processed.add(id);
        return true;
      }),
    } as unknown as jest.Mocked<ProcessedEventRepository>;

    mockApi = {
      notifyOrderAccepted: jest.fn(async () => undefined),
    };

    processor = new OrderEventProcessor(
      processedRepo,
      mockApi as unknown as MockExternalApiService,
      2,
      1,
    );
  });

  it('calls external API and marks event processed', async () => {
    const result = await processor.process(event);

    expect(result.status).toBe('processed');
    expect(mockApi.notifyOrderAccepted).toHaveBeenCalledTimes(1);
    expect(processed.has('evt-1')).toBe(true);
  });

  it('skips duplicate events without calling API again', async () => {
    processed.add('evt-1');

    const result = await processor.process(event);

    expect(result.status).toBe('duplicate');
    expect(mockApi.notifyOrderAccepted).not.toHaveBeenCalled();
  });

  it('retries transient failures then succeeds', async () => {
    mockApi.notifyOrderAccepted
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);

    const result = await processor.process(event);

    expect(result.status).toBe('processed');
    expect(mockApi.notifyOrderAccepted).toHaveBeenCalledTimes(2);
  });

  it('sends to DLQ after exhausting retries', async () => {
    mockApi.notifyOrderAccepted.mockRejectedValue(new Error('permanent'));
    const onDlq = jest.fn(async () => undefined);

    const result = await processor.process(event, { onDlq });

    expect(result.status).toBe('dlq');
    expect(result.reason).toBe('processing_failed');
    expect(onDlq).toHaveBeenCalledWith('processing_failed');
    expect(mockApi.notifyOrderAccepted).toHaveBeenCalledTimes(3); // initial + 2 retries
    expect(processed.has('evt-1')).toBe(true);
  });
});
