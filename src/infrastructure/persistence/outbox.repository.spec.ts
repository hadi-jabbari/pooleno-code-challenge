import { OutboxRepository } from './outbox.repository';

describe('OutboxRepository (contract)', () => {
  it('exposes claim and mark APIs used by the publisher', () => {
    const proto = OutboxRepository.prototype;
    expect(typeof proto.claimUnpublished).toBe('function');
    expect(typeof proto.markPublished).toBe('function');
    expect(typeof proto.markPublishedOne).toBe('function');
  });
});
