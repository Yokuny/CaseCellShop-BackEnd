# Relatório de Observabilidade — CaseCellShop-BackEnd

> Auditoria dos pilares de observabilidade (logs, métricas, traces, alertas e leitura
> operacional). Indica o que **já existe** e o que **falta** em cada pilar.

## Resumo

| Pilar | Status | Cobertura | Principal lacuna |
| --- | --- | --- | --- |
| **Logs** | ✅ Implementado | JSON estruturado, propagação de `correlationId`/`orderId` via AsyncLocalStorage | Sem agregação/envio centralizado de logs |
| **Métricas** | ✅ Implementado | 7 métricas custom (HTTP, cache, estoque, orders, Kafka, ERP) + defaults | Sem instrumentação de Redis/MySQL, sem KPIs de negócio |
| **Traces** | ❌ Ausente | Sem OpenTelemetry | Implementar SDK `@opentelemetry` + exporter |
| **Alertas** | ❌ Ausente | Apenas queries de exemplo no README | Criar regras Prometheus + Alertmanager |
| **Dashboards** | ✅ Implementado | Dashboard Grafana de 8 painéis auto-provisionado | Sem SLI/SLO, sem visão de topologia |
| **Health endpoints** | ⚠️ Básico | `/health` retorna 200 fixo | Sem `/readiness`, sem checagem de dependências |
| **Docker/Infra** | ✅ Completo | Prometheus + Grafana + porta de métricas do backend | — |

---

## 1. Logs ✅ (bem implementado)

**Biblioteca e implementação:**
- **Biblioteca:** Pino (logging JSON estruturado)
- **Local:** `src/logger/`
  - `logger.ts` — configuração do Pino com saída estruturada
  - `context.ts` — AsyncLocalStorage para propagação de correlation/order ID
  - `index.ts` — barrel export

**Recursos principais:**
- **Logging estruturado:** todas as linhas em JSON com metadados de serviço (`service: "casecellshop-backend"`).
- **Propagação de `correlationId`:**
  - `AsyncLocalStorage` captura o `correlationId` por request
  - Injetado automaticamente via `mixin()` em cada linha de log (sem passar manualmente)
  - Definido em `src/middlewares/correlationId.middleware.ts` (gera UUID ou aceita headers `x-correlation-id`/`x-request-id`)
  - Devolvido no header da resposta para rastreio do cliente
- **Propagação de `orderId`:** anexado ao contexto após criação do pedido via `setOrderId()`.
- **Níveis de log:** configurável via `LOG_LEVEL` (fatal/error/warn/info/debug/trace; default: info).
- **Request logging:** `src/middlewares/requestLogger.middleware.ts` loga método, path, statusCode, durationMs.
- **Emissão:** stdout (JSON).

**Faltando:**
- Sem envio/centralização de logs (apenas console; sem ELK, Datadog, CloudWatch).
- Correlação só interna — não propaga `correlationId` para sistemas externos.

---

## 2. Métricas ✅ (bem instrumentado)

**Biblioteca e setup:**
- **Biblioteca:** prom-client 15
- **Endpoint:** `/metrics` na porta 9100 (`METRICS_PORT`)
- **Local:** `src/metrics.ts`

**Métricas definidas:**

| Métrica | Tipo | Labels | Finalidade |
| --- | --- | --- | --- |
| `http_request_duration_seconds` | Histogram | method, route, status_code | Latência HTTP (buckets: 5ms–10s) |
| `cache_operations_total` | Counter | cache, result | Hit/miss/stale/error de cache |
| `stock_reservation_total` | Counter | result | Reserva/insuficiente/liberação de estoque |
| `checkout_orders_total` | Counter | status | Orders por estado (accepted/confirmed/failed/idempotent_hit) |
| `checkout_processing_duration_seconds` | Histogram | result | Duração do checkout no worker (5ms–30s) |
| `kafka_messages_total` | Counter | topic, result | Mensagens produced/consumed/retried/dead_letter |
| `erp_billing_duration_seconds` | Histogram | result | Latência da chamada ERP (50ms–5s) |
| **Default metrics** | (prom-client) | — | CPU, memória, file descriptors |

**Locais de instrumentação:**
- HTTP: `src/middlewares/responseTime.middleware.ts`
- Cache: `src/cache/product.cache.ts`
- Estoque: `src/services/checkout.service.ts`
- Orders: `src/services/checkout.service.ts` e `src/workers/checkout.consumer.ts`
- Kafka: `src/messaging/producer.ts` (produce) e `src/workers/checkout.consumer.ts` (consume/retry/dead_letter)
- ERP: `src/services/erp.service.ts`

**Faltando:**
- Sem métricas de negócio (receita, abandono de carrinho, conversão).
- Redis e pool MySQL não instrumentados (só defaults do prom-client).
- Sem gauge custom para profundidade de fila ou distribuição de estados de pedido.

---

## 3. Traces ❌ (ausente)

- Sem bibliotecas OpenTelemetry (`@opentelemetry`) nas dependências.
- Sem SDK/exporter de tracing configurado.
- Sem criação de spans ou geração de trace ID.
- O `correlationId` funciona como **ID manual de rastreio de request**, não como trace ID padronizado.
- Sem exportação para Jaeger, Datadog, New Relic, etc.

---

## 4. Alertas ❌ (ausente)

- Sem arquivos de regras Prometheus (`*.rules.yml`, `alerts.yml`).
- Sem configuração de Alertmanager.
- Sem regras de alerting no Grafana.

**O que existe (apenas conceitual no README):**
- Cache hit ratio < 70%:
  `sum(rate(cache_operations_total{result="hit"}[5m])) / sum(rate(cache_operations_total[5m])) < 0.7`
- Pressão de estoque:
  `increase(stock_reservation_total{result="insufficient"}[5m]) > 0`
- Falhas de checkout:
  `increase(checkout_orders_total{status="failed"}[10m]) > 0`

---

## 5. Dashboards / leitura operacional ✅

**Setup Grafana:**
- **Dashboard:** `grafana/dashboards/casecellshop.json`
- **Provisionamento:** `grafana/provisioning/dashboards/dashboards.yaml` (auto-load no startup)
- **Datasource:** `grafana/provisioning/datasources/datasource.yaml` (Prometheus em `http://prometheus:9090`)

**Painéis (8 no total):**
1. HTTP req/s por rota
2. Latência HTTP p95
3. Operações de cache (hit/miss/stale)
4. Cache hit ratio %
5. Orders por status
6. Reservas de estoque por resultado
7. Mensagens Kafka (checkout.requested) por resultado
8. Latência ERP p95

**Refresh:** auto a cada 10s.

**Faltando:**
- Sem dashboard de SLI/SLO.
- Sem alertas no dashboard.
- Sem visão de topologia/dependências.

---

## 6. Health / Readiness ⚠️ (básico)

- **GET `/health`** → `app.ts` (~linha 27): retorna `{ "status": "ok", "timestamp": "..." }` com 200 fixo (sem checar dependências).

**Faltando:**
- Sem `/readiness` e `/liveness` (estilo Kubernetes).
- Sem checagem de saúde de MySQL, Redis, Kafka.
- Resposta sempre 200 enquanto o processo estiver de pé.

---

## 7. Docker Compose / Infraestrutura ✅ (completo)

- **Arquivo:** `docker-compose.yaml`
- **Prometheus:** `prom/prometheus:latest` na porta 9090 (scrape do backend `:9100/metrics` a cada 15s)
- **Grafana:** `grafana/grafana:latest` na porta 3100 (provisionado com dashboards e datasource)
- **Backend metrics:** porta 9100 (`METRICS_PORT`)
- **MySQL, Redis, Kafka:** todos com health checks
- **Prometheus config:** `prometheus.yml` — job `casecellshop-backend` scrapeando `casecellshop-back:9100/metrics`

---

## Próximos passos (se expandir a observabilidade)

1. **Traces:** adicionar `@opentelemetry/api`, `@opentelemetry/sdk-node`,
   `@opentelemetry/auto-instrumentations-node` e um exporter (Jaeger/OTLP); correlacionar
   `traceId` com os logs Pino.
2. **Alertas:** criar `alert.rules.yml` com limiares (cache hit ratio, falhas de checkout,
   pressão de estoque, latência) e configurar Alertmanager ou alertas no Grafana.
3. **Health:** evoluir `/health` para checar MySQL/Redis/Kafka; adicionar `/readiness`
   (todas as deps de pé) e `/liveness` (processo vivo).
4. **Métricas:** instrumentar cliente Redis e pool MySQL; adicionar KPIs de negócio.
5. **Envio de logs:** integrar Pino a um transport (pino-datadog, pino-elasticsearch).
