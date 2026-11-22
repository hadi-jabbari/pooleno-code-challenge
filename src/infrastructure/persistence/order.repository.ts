import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray, or } from 'drizzle-orm';
import { Order, Trade } from '../../domain/order/order.types';
import { DRIZZLE, DrizzleDb } from '../database/database.module';
import { fromOrderRow, fromTradeRow, toOrderRow, toTradeInsert } from '../database/mappers';
import { orders, outbox, trades } from '../database/schema';

export interface OrderAcceptedEventPayload {
  eventId: string;
  orderId: string;
  symbol: string;
  side: string;
  price: number;
  quantity: number;
  remainingQuantity: number;
  status: string;
  tradeIds: string[];
  occurredAt: string;
}

@Injectable()
export class OrderRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findById(id: string): Promise<Order | null> {
    const rows = await this.db.select().from(orders).where(eq(orders.id, id)).limit(1);
    const row = rows[0];
    return row ? fromOrderRow(row) : null;
  }

  async findTradesForOrder(orderId: string): Promise<Trade[]> {
    const rows = await this.db
      .select()
      .from(trades)
      .where(or(eq(trades.buyOrderId, orderId), eq(trades.sellOrderId, orderId)));
    return rows.map(fromTradeRow);
  }

  /**
   * Persist matching outcome + outbox event in a single transaction.
   * Resting counterparty updates are included so DB stays consistent with the book.
   */
  async saveMatchOutcome(params: {
    incoming: Order;
    counterpartUpdates: Order[];
    newTrades: Trade[];
    event: OrderAcceptedEventPayload;
  }): Promise<void> {
    const { incoming, counterpartUpdates, newTrades, event } = params;

    await this.db.transaction(async (tx) => {
      await tx.insert(orders).values(toOrderRow(incoming));

      if (counterpartUpdates.length > 0) {
        for (const order of counterpartUpdates) {
          await tx
            .update(orders)
            .set({
              remainingQuantity: order.remainingQuantity.toString(),
              status: order.status,
            })
            .where(eq(orders.id, order.id));
        }
      }

      if (newTrades.length > 0) {
        await tx.insert(trades).values(newTrades.map(toTradeInsert));
      }

      await tx.insert(outbox).values({
        id: event.eventId,
        aggregateId: incoming.id,
        eventType: 'order.accepted',
        payload: event,
      });
    });
  }

  async findOrdersByIds(ids: string[]): Promise<Order[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.db.select().from(orders).where(inArray(orders.id, ids));
    return rows.map(fromOrderRow);
  }
}
