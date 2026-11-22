import { MatchingEngine } from './matching-engine';
import { Order, OrderSide, OrderStatus } from '../order/order.types';

function makeOrder(
  overrides: Partial<Order> & Pick<Order, 'id' | 'side' | 'price' | 'quantity'>,
): Order {
  return {
    symbol: 'BTC-IRT',
    remainingQuantity: overrides.quantity,
    status: OrderStatus.OPEN,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('MatchingEngine', () => {
  let engine: MatchingEngine;

  beforeEach(() => {
    engine = new MatchingEngine();
  });

  it('rests a buy order when no asks exist', () => {
    const result = engine.match(
      makeOrder({ id: 'b1', side: OrderSide.BUY, price: 100, quantity: 5 }),
    );

    expect(result.trades).toHaveLength(0);
    expect(result.resting).toBe(true);
    expect(result.order.status).toBe(OrderStatus.OPEN);
    expect(engine.getBook('BTC-IRT').bids.bestPrice()).toBe(100);
  });

  it('fully matches when prices cross', () => {
    engine.match(makeOrder({ id: 's1', side: OrderSide.SELL, price: 100, quantity: 3 }));

    const result = engine.match(
      makeOrder({ id: 'b1', side: OrderSide.BUY, price: 100, quantity: 3 }),
    );

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({
      buyOrderId: 'b1',
      sellOrderId: 's1',
      price: 100,
      quantity: 3,
    });
    expect(result.order.status).toBe(OrderStatus.FILLED);
    expect(result.resting).toBe(false);
    expect(engine.getBook('BTC-IRT').asks.bestPrice()).toBeUndefined();
  });

  it('partially fills and rests residual', () => {
    engine.match(makeOrder({ id: 's1', side: OrderSide.SELL, price: 100, quantity: 2 }));

    const result = engine.match(
      makeOrder({ id: 'b1', side: OrderSide.BUY, price: 100, quantity: 5 }),
    );

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]!.quantity).toBe(2);
    expect(result.order.remainingQuantity).toBe(3);
    expect(result.order.status).toBe(OrderStatus.PARTIALLY_FILLED);
    expect(result.resting).toBe(true);
    expect(engine.getBook('BTC-IRT').bids.bestPrice()).toBe(100);
  });

  it('respects price priority on the ask side (lowest ask first)', () => {
    engine.match(makeOrder({ id: 's-high', side: OrderSide.SELL, price: 110, quantity: 1 }));
    engine.match(makeOrder({ id: 's-low', side: OrderSide.SELL, price: 100, quantity: 1 }));

    const result = engine.match(
      makeOrder({ id: 'b1', side: OrderSide.BUY, price: 110, quantity: 1 }),
    );

    expect(result.trades[0]!.sellOrderId).toBe('s-low');
    expect(result.trades[0]!.price).toBe(100);
  });

  it('respects price priority on the bid side (highest bid first)', () => {
    engine.match(makeOrder({ id: 'b-low', side: OrderSide.BUY, price: 90, quantity: 1 }));
    engine.match(makeOrder({ id: 'b-high', side: OrderSide.BUY, price: 100, quantity: 1 }));

    const result = engine.match(
      makeOrder({ id: 's1', side: OrderSide.SELL, price: 90, quantity: 1 }),
    );

    expect(result.trades[0]!.buyOrderId).toBe('b-high');
    expect(result.trades[0]!.price).toBe(100);
  });

  it('respects FIFO at the same price level', () => {
    engine.match(makeOrder({ id: 's1', side: OrderSide.SELL, price: 100, quantity: 1 }));
    engine.match(makeOrder({ id: 's2', side: OrderSide.SELL, price: 100, quantity: 1 }));

    const first = engine.match(
      makeOrder({ id: 'b1', side: OrderSide.BUY, price: 100, quantity: 1 }),
    );
    const second = engine.match(
      makeOrder({ id: 'b2', side: OrderSide.BUY, price: 100, quantity: 1 }),
    );

    expect(first.trades[0]!.sellOrderId).toBe('s1');
    expect(second.trades[0]!.sellOrderId).toBe('s2');
  });

  it('does not match when prices do not cross', () => {
    engine.match(makeOrder({ id: 's1', side: OrderSide.SELL, price: 110, quantity: 1 }));

    const result = engine.match(
      makeOrder({ id: 'b1', side: OrderSide.BUY, price: 100, quantity: 1 }),
    );

    expect(result.trades).toHaveLength(0);
    expect(result.resting).toBe(true);
  });

  it('walks multiple price levels for a large aggressive order', () => {
    engine.match(makeOrder({ id: 's1', side: OrderSide.SELL, price: 100, quantity: 2 }));
    engine.match(makeOrder({ id: 's2', side: OrderSide.SELL, price: 105, quantity: 3 }));

    const result = engine.match(
      makeOrder({ id: 'b1', side: OrderSide.BUY, price: 110, quantity: 4 }),
    );

    expect(result.trades).toHaveLength(2);
    expect(result.trades[0]).toMatchObject({ sellOrderId: 's1', price: 100, quantity: 2 });
    expect(result.trades[1]).toMatchObject({ sellOrderId: 's2', price: 105, quantity: 2 });
    expect(result.order.remainingQuantity).toBe(0);
    expect(result.order.status).toBe(OrderStatus.FILLED);

    const book = engine.getBook('BTC-IRT');
    expect(book.asks.bestPrice()).toBe(105);
    expect(book.asks.peekBest()?.remainingQuantity).toBe(1);
  });
});
