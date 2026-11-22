# Pooleno Order-Matching Backend

Senior Backend (Node.js) interview assignment: limit-order API, price-time matching, PostgreSQL persistence, Kafka outbox/consumer with retries and idempotency.

## Stack

- NestJS + TypeScript
- PostgreSQL + Drizzle ORM
- Kafka (KafkaJS) via Docker Compose
- Jest

## Quick start

### 1. Infrastructure

```bash
docker compose up -d
```

Wait until Postgres and Kafka are healthy.

Default host ports (chosen to avoid clashing with other local stacks):

| Service  | Host port |
|----------|-----------|
| Postgres | `5433`    |
| Kafka    | `9094`    |

### 2. App setup

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run start:dev
```

API: `http://localhost:3000`

### 3. Roles (optional)

| `APP_ROLE` | Behavior |
|------------|----------|
| `all` (default) | HTTP + outbox publisher + Kafka consumer |
| `api` / `publisher` | HTTP + outbox publisher |
| `worker` / `consumer` | Kafka consumer only |

## API

### Create order

```bash
curl -s -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d "{\"symbol\":\"BTC-IRT\",\"side\":\"SELL\",\"price\":100,\"quantity\":2}"
```

```bash
curl -s -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d "{\"symbol\":\"BTC-IRT\",\"side\":\"BUY\",\"price\":100,\"quantity\":5}"
```

### Get order

```bash
curl -s http://localhost:3000/orders/<uuid>
```

### Order book snapshot

```bash
curl -s http://localhost:3000/orderbook/BTC-IRT
```

### Health

- `GET /health/live` — liveness
- `GET /health/ready` — readiness (DB + Kafka)

## Tests

```bash
npm test
```

Coverage includes:

- Matching engine (price priority, FIFO, partial fills, multi-level walks)
- Outbox publisher publish/mark flow
- Async processor (retries, duplicates, DLQ)

## Design document

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for data structures, complexity, outbox/crash safety, offset semantics, scaling, and Kubernetes considerations.

## Project layout

```
src/
  domain/           # matching engine (pure)
  infrastructure/   # drizzle, kafka, repositories
  modules/          # Nest modules (orders, messaging, health)
drizzle/            # SQL migrations
docs/ARCHITECTURE.md
docker-compose.yml
```
