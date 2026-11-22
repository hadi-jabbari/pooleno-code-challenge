export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum OrderStatus {
  OPEN = 'OPEN',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  REJECTED = 'REJECTED',
}

export interface Order {
  id: string;
  symbol: string;
  side: OrderSide;
  price: number;
  quantity: number;
  remainingQuantity: number;
  status: OrderStatus;
  createdAt: Date;
}

export interface Trade {
  id: string;
  symbol: string;
  buyOrderId: string;
  sellOrderId: string;
  price: number;
  quantity: number;
  createdAt: Date;
}

export interface MatchResult {
  order: Order;
  trades: Trade[];
  /** Resting orders that were mutated (partially or fully filled). */
  touchedOrders: Order[];
  resting: boolean;
}
