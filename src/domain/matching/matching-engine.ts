import { randomUUID } from 'crypto';
import {
  MatchResult,
  Order,
  OrderSide,
  OrderStatus,
  Trade,
} from '../order/order.types';
import { OrderBook } from './order-book';

export class MatchingEngine {
  private readonly books = new Map<string, OrderBook>();

  getBook(symbol: string): OrderBook {
    let book = this.books.get(symbol);
    if (!book) {
      book = new OrderBook(symbol);
      this.books.set(symbol, book);
    }
    return book;
  }

  /**
   * Match an incoming limit order against the opposite side.
   * Price-time priority with partial fills; residual rests on the book.
   *
   * Time complexity: O(k · log p) where k = number of price levels crossed
   * and p = distinct prices on the opposite side (binary search on price index).
   */
  match(incoming: Order): MatchResult {
    const book = this.getBook(incoming.symbol);
    const opposite = book.oppositeSide(incoming.side);
    const trades: Trade[] = [];
    const touched = new Map<string, Order>();

    while (incoming.remainingQuantity > 0) {
      const resting = opposite.peekBest();
      if (!resting || !this.pricesCross(incoming, resting)) {
        break;
      }

      const tradeQty = Math.min(incoming.remainingQuantity, resting.remainingQuantity);
      const tradePrice = resting.price;

      incoming.remainingQuantity -= tradeQty;
      resting.remainingQuantity -= tradeQty;

      trades.push({
        id: randomUUID(),
        symbol: incoming.symbol,
        buyOrderId: incoming.side === OrderSide.BUY ? incoming.id : resting.id,
        sellOrderId: incoming.side === OrderSide.SELL ? incoming.id : resting.id,
        price: tradePrice,
        quantity: tradeQty,
        createdAt: new Date(),
      });

      this.applyStatus(resting);
      touched.set(resting.id, resting);

      if (resting.remainingQuantity === 0) {
        opposite.dequeueBest();
      } else {
        // Residual stays at front of its price level (same order, time priority preserved).
        opposite.dequeueBest();
        opposite.requeueFront(resting);
        break;
      }
    }

    this.applyStatus(incoming);

    const resting = incoming.remainingQuantity > 0;
    if (resting) {
      book.restingSide(incoming.side).enqueue(incoming);
    }

    return {
      order: incoming,
      trades,
      touchedOrders: [...touched.values()],
      resting,
    };
  }

  private pricesCross(incoming: Order, resting: Order): boolean {
    if (incoming.side === OrderSide.BUY) {
      return incoming.price >= resting.price;
    }
    return incoming.price <= resting.price;
  }

  private applyStatus(order: Order): void {
    if (order.remainingQuantity === 0) {
      order.status = OrderStatus.FILLED;
    } else if (order.remainingQuantity < order.quantity) {
      order.status = OrderStatus.PARTIALLY_FILLED;
    } else {
      order.status = OrderStatus.OPEN;
    }
  }
}
