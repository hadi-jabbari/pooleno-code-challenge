import { Order, OrderSide } from '../order/order.types';

/**
 * Price-level FIFO queue for a single side of the book.
 * Prices are stored as Map keys; a sorted array maintains price priority.
 */
export class OrderBookSide {
  private readonly levels = new Map<number, Order[]>();
  private readonly sortedPrices: number[] = [];

  constructor(private readonly side: OrderSide) {}

  get depth(): number {
    return this.sortedPrices.length;
  }

  bestPrice(): number | undefined {
    return this.sortedPrices[0];
  }

  enqueue(order: Order): void {
    const queue = this.levels.get(order.price);
    if (queue) {
      queue.push(order);
      return;
    }

    this.levels.set(order.price, [order]);
    this.insertPrice(order.price);
  }

  /**
   * Peek at the best resting order without removing it.
   */
  peekBest(): Order | undefined {
    const price = this.bestPrice();
    if (price === undefined) {
      return undefined;
    }
    return this.levels.get(price)?.[0];
  }

  /**
   * Remove the best resting order from the book.
   */
  dequeueBest(): Order | undefined {
    const price = this.bestPrice();
    if (price === undefined) {
      return undefined;
    }

    const queue = this.levels.get(price);
    if (!queue || queue.length === 0) {
      return undefined;
    }

    const order = queue.shift()!;
    if (queue.length === 0) {
      this.levels.delete(price);
      this.sortedPrices.shift();
    }
    return order;
  }

  /**
   * Re-insert an order at the front of its price level (partial fill residual).
   * Preserves time priority for the remaining quantity of the same order.
   */
  requeueFront(order: Order): void {
    const queue = this.levels.get(order.price);
    if (queue) {
      queue.unshift(order);
      return;
    }
    this.levels.set(order.price, [order]);
    this.insertPrice(order.price);
  }

  snapshot(limit = 10): Array<{ price: number; quantity: number; orderCount: number }> {
    return this.sortedPrices.slice(0, limit).map((price) => {
      const queue = this.levels.get(price) ?? [];
      const quantity = queue.reduce((sum, o) => sum + o.remainingQuantity, 0);
      return { price, quantity, orderCount: queue.length };
    });
  }

  private insertPrice(price: number): void {
    const index = this.findInsertIndex(price);
    this.sortedPrices.splice(index, 0, price);
  }

  /**
   * Buy side: descending prices (best = highest).
   * Sell side: ascending prices (best = lowest).
   */
  private findInsertIndex(price: number): number {
    let low = 0;
    let high = this.sortedPrices.length;

    while (low < high) {
      const mid = (low + high) >>> 1;
      const midPrice = this.sortedPrices[mid]!;
      const shouldGoLeft =
        this.side === OrderSide.BUY ? price > midPrice : price < midPrice;

      if (shouldGoLeft) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }

    return low;
  }
}

export class OrderBook {
  readonly bids = new OrderBookSide(OrderSide.BUY);
  readonly asks = new OrderBookSide(OrderSide.SELL);

  constructor(readonly symbol: string) {}

  restingSide(side: OrderSide): OrderBookSide {
    return side === OrderSide.BUY ? this.bids : this.asks;
  }

  oppositeSide(side: OrderSide): OrderBookSide {
    return side === OrderSide.BUY ? this.asks : this.bids;
  }
}
