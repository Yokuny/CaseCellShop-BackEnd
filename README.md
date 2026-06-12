# CaseCellShop — Backend

Mini-tarefa prática do desafio técnico pleno backend ([`desafio.md`](desafio.md)). Serviço que **expõe o catálogo de produtos com cache**, **inicia um checkout assíncrono** e **permite consultar o status do pedido**, com foco em cache, observabilidade e consistência.

## Stack

| Camada | Tecnologia | Papel |
| --- | --- | --- |
| API | **Express 5 + TypeScript** | rotas, validação, contrato |
| Banco | **MySQL 8** (`mysql2`) | read-model do catálogo (simula o ERP) + pedidos; estoque com UPDATE atômico |
| Cache | **Redis 7** (`ioredis`) | cache-aside da vitrine com TTL, invalidação, stampede lock e fallback stale |
| Mensageria | **Kafka** (`kafkajs`, KRaft) | checkout assíncrono (`checkout.requested`) + worker |
| Métricas | **prom-client + Prometheus + Grafana** | cache hit/miss, checkout, fila/worker, ERP, estoque |
| Logs | **pino** | logs estruturados com `correlationId`/`orderId` (AsyncLocalStorage) |
| Contrato | **zod-to-openapi + Swagger UI** | OpenAPI gerado dos schemas Zod, servido em `/docs` |
| Testes | **Vitest** | regra de negócio + concorrência + cache |

> A stack (MySQL/Kafka/Redis) segue o que foi pedido; o desafio cita Datadog como referência conceitual e aqui o equivalente é Prometheus + Grafana.

## Como rodar (Docker Compose — recomendado)

```bash
cp .env.example .env
pnpm docker:up
```

Sobe MySQL, Redis, Kafka, Kafka UI, backend (com schema/seed automáticos), Prometheus e Grafana.

| Serviço | URL |
| --- | --- |
| API | http://localhost:8080 |
| Swagger UI | http://localhost:8080/docs |
| OpenAPI JSON | http://localhost:8080/openapi.json |
| Métricas | http://localhost:9100/metrics |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3100 (admin/admin) |
| Kafka UI | http://localhost:8085 |

### Local sem Docker

Requer MySQL, Redis e Kafka acessíveis (veja hosts/portas no `.env`). Depois: `pnpm install && pnpm dev`.

## Endpoints

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/products` | catálogo (cache Redis com TTL) |
| GET | `/products/:id` | detalhe do produto |
| POST | `/checkout` | inicia checkout assíncrono → **202 Accepted** |
| GET | `/orders/:orderId/status` | status do pedido |
| GET | `/health` | healthcheck |

### Fluxo de exemplo

```bash
# 1. Catálogo
curl http://localhost:8080/products

# 2. Checkout (idempotente via header Idempotency-Key)
curl -X POST http://localhost:8080/checkout \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 11111111-1111-1111-1111-111111111111" \
  -d '{"items":[{"productId":"case-iphone-15","quantity":2}]}'
# → 202 { "data": { "orderId": "...", "status": "pending" } }

# 3. Status (pending → processing → confirmed)
curl http://localhost:8080/orders/<orderId>/status
```

## Decisões e trade-offs

- **Estoque sem overselling (consistência):** reserva via `UPDATE products SET stock = stock - q WHERE id = ? AND stock >= q` dentro de uma transação. `affectedRows = 0` ⇒ sem estoque (409). Escolhido em vez de lock pessimista por ser mais simples e barato sob alta concorrência; o teste de concorrência prova que nunca vende além do estoque.
- **Idempotência:** `orders.idempotency_key UNIQUE`. O cliente envia `Idempotency-Key`; retry/duplo clique retornam o mesmo pedido. Em corrida, quem perde o INSERT **libera o estoque reservado**.
- **Publish depois de persistir:** o pedido é gravado (`pending`) **antes** de publicar no Kafka, evitando "mensagem fantasma". O risco residual (pedido `pending` sem mensagem, se o publish falhar) é recuperável — em produção usaria **transactional outbox**. Documentado como simplificação.
- **Resiliência assíncrona:** o worker simula o faturamento no ERP. Falha transitória ⇒ Kafka reentrega (retry); ao atingir `CHECKOUT_MAX_ATTEMPTS` ⇒ pedido `failed` e **reconciliação** (estoque devolvido). Processamento é idempotente (ignora pedido já `confirmed`).
- **Cache (vitrine):** cache-aside no Redis com TTL curto (`fresh`) + cópia `stale` de vida longa para fallback; **lock single-flight** evita cache stampede; invalidação do `fresh` quando o estoque muda no checkout.
- **Observabilidade:** logs estruturados com `correlationId` (propagado request→worker via AsyncLocalStorage e pela mensagem Kafka) e `orderId`; métricas Prometheus; dashboard Grafana provisionado.

## Observabilidade — dashboard, alerta e runbook

**Dashboard (Grafana, já provisionado):** HTTP req/s e p95, cache hit ratio, pedidos por status, reservas de estoque, mensagens Kafka por resultado, p95 do ERP.

**Métricas principais:** `cache_operations_total{result}`, `checkout_orders_total{status}`, `stock_reservation_total{result}`, `kafka_messages_total{topic,result}`, `checkout_processing_duration_seconds`, `erp_billing_duration_seconds`.

**Exemplos de alerta (Prometheus/Datadog-equivalente):**
- Cache hit ratio baixo: `sum(rate(cache_operations_total{result="hit"}[5m])) / sum(rate(cache_operations_total[5m])) < 0.7`.
- Furo de estoque/overselling: `increase(stock_reservation_total{result="insufficient"}[5m]) > 0` (sinaliza pressão de estoque).
- Falha de checkout: `increase(checkout_orders_total{status="failed"}[10m]) > 0`.

**Runbook — checkout travado em `pending`/`processing`:**
1. Filtrar logs pelo `correlationId`/`orderId` (liga request → worker).
2. Conferir `kafka_messages_total{result="dead_letter"}` e o lag do consumer (Kafka UI).
3. Validar disponibilidade do ERP simulado (`erp_billing_duration_seconds`, `ERP_FAILURE_RATE`).
4. Pedidos `failed` já têm o estoque reconciliado; reprocessamento manual republica em `checkout.requested`.

## Testes

```bash
pnpm test
```

- `stock.concurrency` — 50 reservas simultâneas não causam overselling.
- `checkout.service` — idempotência, 409 sem estoque, happy path (publish Kafka), liberação em corrida.
- `product.cache` — hit/miss, invalidação e fallback stale.

## Limitações (por ser desafio)

- Catálogo/estoque e ERP são **simulados** no próprio MySQL/serviço (sem ERP real, pagamento, auth ou deploy).
- Testes de negócio usam mocks/modelo fiel da semântica SQL; testes de integração contra MySQL real complementariam.
- Sem transactional outbox (descrito acima como evolução).

## Scripts

| Script | Ação |
| --- | --- |
| `pnpm dev` | dev com hot-reload (tsx) |
| `pnpm build` / `start` | compila para `dist/` / roda o build |
| `pnpm test` | Vitest |
| `pnpm typecheck` / `lint` / `format` | tsc / Biome |
| `pnpm openapi:json` | exporta `openapi.json` |
| `pnpm docker:up` / `down` / `logs` / `clean` | Docker Compose |

Prompts de IA usados: ver [PROMPTS.md](PROMPTS.md).
