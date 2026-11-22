import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MatchingEngine } from '../../domain/matching/matching-engine';
import { Order, OrderStatus, Trade } from '../../domain/order/order.types';
import {
  OrderAcceptedEventPayload,
  OrderRepository,
} from '../../infrastructure/persistence/order.repository';
import { CreateOrderDto } from './dto/create-order.dto';

export interface CreateOrderResponse {
  order: Order;
  trades: Trade[];
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly matchingEngine: MatchingEngine,
    private readonly orderRepository: OrderRepository,
  ) {}

  async create(dto: CreateOrderDto): Promise<CreateOrderResponse> {
    const incoming: Order = {
      id: randomUUID(),
      symbol: dto.symbol.toUpperCase(),
      side: dto.side,
      price: dto.price,
      quantity: dto.quantity,
      remainingQuantity: dto.quantity,
      status: OrderStatus.OPEN,
      createdAt: new Date(),
    };

    const result = this.matchingEngine.match(incoming);

    const event: OrderAcceptedEventPayload = {
      eventId: randomUUID(),
      orderId: result.order.id,
      symbol: result.order.symbol,
      side: result.order.side,
      price: result.order.price,
      quantity: result.order.quantity,
      remainingQuantity: result.order.remainingQuantity,
      status: result.order.status,
      tradeIds: result.trades.map((t) => t.id),
      occurredAt: new Date().toISOString(),
    };

    await this.orderRepository.saveMatchOutcome({
      incoming: result.order,
      counterpartUpdates: result.touchedOrders,
      newTrades: result.trades,
      event,
    });

    return { order: result.order, trades: result.trades };
  }

  async getById(id: string): Promise<{ order: Order; trades: Trade[] }> {
    const order = await this.orderRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    const trades = await this.orderRepository.findTradesForOrder(id);
    return { order, trades };
  }

  getOrderBook(symbol: string, depth = 10) {
    const book = this.matchingEngine.getBook(symbol.toUpperCase());
    return {
      symbol: symbol.toUpperCase(),
      bids: book.bids.snapshot(depth),
      asks: book.asks.snapshot(depth),
    };
  }
}
