import {
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const orderSideEnum = pgEnum('order_side', ['BUY', 'SELL']);
export const orderStatusEnum = pgEnum('order_status', [
  'OPEN',
  'PARTIALLY_FILLED',
  'FILLED',
  'REJECTED',
]);

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey(),
  symbol: text('symbol').notNull(),
  side: orderSideEnum('side').notNull(),
  price: numeric('price', { precision: 20, scale: 8 }).notNull(),
  quantity: numeric('quantity', { precision: 20, scale: 8 }).notNull(),
  remainingQuantity: numeric('remaining_quantity', { precision: 20, scale: 8 }).notNull(),
  status: orderStatusEnum('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const trades = pgTable('trades', {
  id: uuid('id').primaryKey(),
  symbol: text('symbol').notNull(),
  buyOrderId: uuid('buy_order_id')
    .notNull()
    .references(() => orders.id),
  sellOrderId: uuid('sell_order_id')
    .notNull()
    .references(() => orders.id),
  price: numeric('price', { precision: 20, scale: 8 }).notNull(),
  quantity: numeric('quantity', { precision: 20, scale: 8 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const outbox = pgTable('outbox', {
  id: uuid('id').primaryKey(),
  aggregateId: uuid('aggregate_id').notNull(),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
});

export const processedEvents = pgTable('processed_events', {
  eventId: text('event_id').primaryKey(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});

export type OrderRow = typeof orders.$inferSelect;
export type NewOrderRow = typeof orders.$inferInsert;
export type TradeRow = typeof trades.$inferSelect;
export type OutboxRow = typeof outbox.$inferSelect;
