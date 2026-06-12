# CaseCellShop

## Arquitetura

Layered Architecture. Fluxo síncrono:
`Route → Controller → Service → Repository → (MySQL / Redis)`

Fluxo assíncrono do checkout:
`Checkout Service → Kafka (checkout.requested) → Worker → ERP simulado → Repository`

### Pastas (`src/`)

| Camada | Responsabilidade |
| --- | --- |
| `config/` | env (Zod), conexões MySQL/Redis/Kafka |
| `logger/` | pino + AsyncLocalStorage (correlationId/orderId) |
| `metrics.ts` | métricas prom-client (servidor de métricas em /metrics) |
| `database/` | DDL idempotente + seed do catálogo |
| `routers/` | rotas Express (`/products`, `/checkout`, `/orders`) |
| `controllers/` | adaptam HTTP ↔ service |
| `services/` | regra de negócio (product, checkout, order) |
| `repositories/` | acesso a dados MySQL (product com estoque atômico, order) |
| `cache/` | cache-aside Redis do catálogo (TTL, stampede, stale) |
| `messaging/` | producer Kafka |
| `workers/` | consumer Kafka (faturamento ERP, retry, reconciliação) |
| `schemas/` | Zod + `.openapi()` (fonte única do contrato) |
| `openapi/` | registry + geração do documento + Swagger UI |
| `middlewares/` | correlationId, requestLogger, responseTime, validação, errorHandler |

### Entrypoints (raiz)

- `app.ts` — Express, rotas, Swagger e `init()` (conecta MySQL+schema, Redis, producer Kafka e sobe o worker).
- `index.ts` — servidor principal (`PORT`) + servidor de métricas (`METRICS_PORT`), com graceful shutdown.

## Regras Críticas

- **Services não importam outros `.service.ts`** — compartilham via repositories.
- **SQL isolado** — apenas `repositories/` e `database/` falam com o MySQL.
- **Redis isolado em `cache/`**; **Kafka isolado em `messaging/` e `workers/`**.
- **Zod é source of truth** — schemas geram o OpenAPI; sem validação manual duplicada.
- **Barrel exports** — importe via `index.ts`.

## Domínios

- `products` — catálogo (MySQL) com cache Redis (`GET /products`, `GET /products/:id`).
- `checkout` — reserva atômica de estoque + idempotência + publish Kafka (`POST /checkout` → 202).
- `orders` — status do pedido (`GET /orders/:orderId/status`).
