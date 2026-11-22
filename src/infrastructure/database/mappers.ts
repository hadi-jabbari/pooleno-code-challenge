import { Order, OrderSide, OrderStatus, Trade } from '../../domain/order/order.types';
import { NewOrderRow, OrderRow, TradeRow } from './schema';

export function toOrderRow(order: Order): NewOrderRow {
  return {
    id: order.id,
    symbol: order.symbol,
    side: order.side,
    price: order.price.toString(),
    quantity: order.quantity.toString(),
    remainingQuantity: order.remainingQuantity.toString(),
    status: order.status,
    createdAt: order.createdAt,
  };
}

export function fromOrderRow(row: OrderRow): Order {
  return {
    id: row.id,
    symbol: row.symbol,
    side: row.side as OrderSide,
    price: Number(row.price),
    quantity: Number(row.quantity),
    remainingQuantity: Number(row.remainingQuantity),
    status: row.status as OrderStatus,
    createdAt: row.createdAt,
  };
}

export function toTradeInsert(trade: Trade) {
  return {
    id: trade.id,
    symbol: trade.symbol,
    buyOrderId: trade.buyOrderId,
    sellOrderId: trade.sellOrderId,
    price: trade.price.toString(),
    quantity: trade.quantity.toString(),
    createdAt: trade.createdAt,
  };
}

export function fromTradeRow(row: TradeRow): Trade {
  return {
    id: row.id,
    symbol: row.symbol,
    buyOrderId: row.buyOrderId,
    sellOrderId: row.sellOrderId,
    price: Number(row.price),
    quantity: Number(row.quantity),
    createdAt: row.createdAt,
  };
}
