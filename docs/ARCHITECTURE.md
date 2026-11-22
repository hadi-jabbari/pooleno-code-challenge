# Architecture & Design Decisions

## Overview

This service is a NestJS monolith that exposes an HTTP API for limit orders, runs an in-memory matching engine, persists state in PostgreSQL (Drizzle), and publishes `order.accepted` events to Kafka through a **transactional outbox**. A Kafka consumer processes those events with retries, idempotency, and a dead-letter queue (DLQ).

```
Client → Orders API → MatchingEngine (memory)
                    → Postgres (orders, trades, outbox)  ──poll──► Kafka
Kafka consumer → Mock external API
              → processed_events (idempotency)
```

`APP_ROLE` can be `all` (default), `api`/`publisher`, or `worker`/`consumer` so the same codebase can be scaled as separate processes later.

---

## 1. Order matching

### Data structures

Per symbol, an `OrderBook` holds two sides:

| Side | Best price | Structure |
|------|------------|-----------|
| Bids (BUY) | Highest | `Map<price, Order[]>` + sorted price index (descending) |
| Asks (SELL) | Lowest | `Map<price, Order[]>` + sorted price index (ascending) |

Each price level is a **FIFO queue** (`Order[]`). Incoming limit orders cross the opposite side while prices cross; residuals rest on their own side.

### Algorithm

1. While incoming remaining qty > 0 and best opposite price crosses:
2. Trade `min(incoming.remaining, resting.remaining)` at the **resting** price (maker price).
3. Fully filled resting orders are dequeued; partial residuals stay at the **front** of their level (same order keeps time priority).
4. Any leftover incoming quantity is enqueued on its side.

### Complexity

| Operation | Complexity | Notes |
|-----------|------------|-------|
| Enqueue / insert price | `O(log p)` | Binary search on sorted price index |
| Match | `O(k · log p)` | `k` = levels (or orders) crossed; `p` = distinct prices |
| Best bid/ask peek | `O(1)` | First entry of sorted index + queue head |
| Snapshot top-N | `O(N)` | Walk first N price levels |

Space: `O(n)` for `n` resting orders.

Trade-off: the live book is **in-memory** for low-latency matching. Durable truth for orders/trades lives in Postgres. A production restart would rebuild the book from open orders (not implemented here; called out as a follow-up).

---

## 2. Crash safety: transactional outbox

**Problem:** If the API process crashes after inserting an order but before publishing to Kafka, the event is lost.

**Solution:** In the same DB transaction as order/trade writes, insert an `outbox` row. A background `OutboxPublisher` polls unpublished rows, produces to Kafka, then sets `published_at`.

Guarantees:

- **At-least-once** delivery to Kafka (publisher may crash after produce but before mark → duplicate Kafka message).
- Ordering per symbol is encouraged by using `symbol` as the Kafka message key (same partition).

---

## 3. Kafka processing guarantees

### Offsets

The consumer runs with **`autoCommit: false`**. After successful handling (or deterministic DLQ handling), it commits `offset + 1`.

This yields **at-least-once** delivery: a crash after side effects but before commit can redeliver.

### Idempotency

`processed_events.event_id` (PK) records successfully handled (or DLQ’d poison) events. On redelivery, the handler skips the external API call and still commits the offset.

Side-effect order:

1. Check idempotency store  
2. Call mock external API (with retries)  
3. Insert `processed_events`  
4. Commit offset  

If the process dies between (2) and (3), a duplicate API call may occur — the external system should also be idempotent in production (e.g. by `eventId`).

### Retries & DLQ

Transient failures retry with exponential backoff (`CONSUMER_RETRY_BASE_MS * 2^attempt`), up to `CONSUMER_MAX_RETRIES`. Exhausted failures go to `order.accepted.dlq`, then the event is marked processed and the offset committed so the partition is not blocked.

### Consumer failures & rebalance

On SIGTERM/SIGINT, Nest `enableShutdownHooks()` stops accepting work; the consumer sets a stopping flag and disconnects. Kafka reassigns partitions to other group members. In-flight messages that did not commit will be redelivered (safe due to idempotency).

---

## 4. Scaling & ordering

- **Partition by symbol** (message key = symbol): all events for one market stay ordered on one partition.
- Scale consumers horizontally within the same `group.id` up to the partition count (3 in local Compose).
- API instances can scale independently; each would need a shared book strategy (single-writer, Redis, or shard-by-symbol). This assignment keeps one in-process book for simplicity.
- Outbox publishers should be single-active or use `SELECT … FOR UPDATE SKIP LOCKED` when multiple API replicas exist (single process is assumed locally).

---

## 5. Kubernetes deployment considerations

No manifests are required for this assignment. Recommended production posture:

| Concern | Approach |
|---------|----------|
| **Liveness** | `GET /health/live` — process up (heap check) |
| **Readiness** | `GET /health/ready` — Postgres reachable; Kafka clients connected |
| **Graceful shutdown** | `terminationGracePeriodSeconds` ≥ consumer session + drain; Nest shutdown hooks stop HTTP, flush outbox once, disconnect Kafka |
| **Config** | Secrets for `DATABASE_URL`; ConfigMap for brokers/topics/roles |
| **Roles** | Separate Deployments: `APP_ROLE=api` (API + outbox) and `APP_ROLE=worker` (consumer) |
| **PDB / HPA** | HPA on CPU/lag (consumer lag exporter); PDB so not all workers die at once |
| **Probes** | Readiness fails while Kafka is reconnecting so traffic/lag shift cleanly |

---

## 6. Module layout

| Layer | Responsibility |
|-------|----------------|
| `domain/` | Pure matching + order types (no Nest/DB/Kafka) |
| `infrastructure/` | Drizzle schema/repos, Kafka client, outbox, mock API |
| `modules/` | Nest wiring: orders HTTP, messaging, health |

This keeps the matching algorithm unit-testable without I/O and makes reliability policies explicit in infrastructure.
