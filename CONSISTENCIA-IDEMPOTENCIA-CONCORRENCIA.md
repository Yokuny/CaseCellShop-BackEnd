# Relatório: Consistência de Estoque, Idempotência e Concorrência — CaseCellShop-BackEnd

> Auditoria do fluxo de checkout/order nas três frentes. Para cada concern indica o que
> **existe e está sólido** e o que está **ausente ou frágil**, com `arquivo:linha`.

## Veredito

Os três requisitos estão atendidos com técnicas **corretas por construção** (não improvisadas)
e há teste de concorrência validando o comportamento. As lacunas remanescentes são de
*hardening* de produção, não falhas no requisito.

---

## 1. Consistência de estoque

### O que existe (sólido)

**Decremento atômico com checagem condicional** — `src/repositories/product.repository.ts:37-38`
```sql
UPDATE products SET stock = stock - :q WHERE id = :id AND stock >= :q
```
- Núcleo do anti-overselling. O `WHERE` garante o decremento só se houver estoque.
- `res.affectedRows === 0` detecta estoque insuficiente → lança 409.
- Sem janela de corrida entre checagem e decremento.

**Transação (tudo-ou-nada)** — `src/repositories/product.repository.ts:27-51` (`reserveStock`)
- `beginTransaction()` (l.30), `commit()` (l.43), `rollback()` (l.46).
- Múltiplos itens em um checkout são all-or-nothing numa única transação.

**Liberação/compensação na falha** — `src/repositories/product.repository.ts:54-68` (`releaseStock`)
- Invocada pelo worker após exceder tentativas: `src/workers/checkout.consumer.ts:44-45`
- Invocada na colisão de idempotência: `src/services/checkout.service.ts:35-37`

**Reconciliação** — `src/workers/checkout.consumer.ts:42-54`
- Ao atingir `CHECKOUT_MAX_ATTEMPTS`, o pedido vai para `failed` e `releaseStock()` devolve o estoque.

**Schema products** — `src/database/schema.ts:7-17`
- `stock INT NOT NULL`, InnoDB. Sem coluna de versão (optimistic lock não necessário aqui).

**Invalidação de cache** — `src/cache/product.cache.ts:125-127` (`invalidateCatalog`)
- Chamada após reserva (`src/services/checkout.service.ts:44-45`) e após release na reconciliação
  (`src/workers/checkout.consumer.ts:46-47`).

### Ausente ou frágil

- **Isolation level implícito** — usa o default do MySQL (`REPEATABLE READ`); adequado, mas não
  declarado explicitamente. Risco baixo.
- **Sem `SELECT ... FOR UPDATE`** — escolha intencional (README): atomic UPDATE é melhor sob alta
  concorrência. Validado por `tests/stock.concurrency.test.ts:31-41`.
- **Sem transactional outbox** — `reserveStock`/`create` commitam no MySQL, mas se o processo morrer
  entre o commit e `publishCheckoutRequested` (`src/services/checkout.service.ts:34-49`), a mensagem
  Kafka se perde. Documentado como simplificação no README. Risco médio.
- **Sem coluna de versão/optimistic lock** — não necessária (atomic UPDATE já previne overselling).

---

## 2. Idempotência

### O que existe (sólido)

**Chave de idempotência via header HTTP + UNIQUE no banco**
- HTTP: `src/controllers/checkout.controller.ts:10` — `req.header("idempotency-key") || randomUUID()`
- Dedup no service: `src/services/checkout.service.ts:12-18` — SELECT antes de INSERT; se achar, retorna o resultado.
- UNIQUE no schema (árbitro final): `src/database/schema.ts:23` — `idempotency_key VARCHAR(128) NOT NULL UNIQUE`
- Tratamento de duplicata: `src/repositories/order.repository.ts:27-40` — `ER_DUP_ENTRY` → retorna `false`;
  service libera o estoque e devolve o pedido vencedor.

**Resposta idempotente** — retorna o pedido existente; métrica `ordersTotal.inc({ status: "idempotent_hit" })`.

**Corrida de idempotência** — duas requisições com a mesma chave: uma vence o INSERT; a outra recebe
`ER_DUP_ENTRY`, libera o estoque reservado e retorna o pedido vencedor. Sem dupla contagem nem reserva órfã.

**Consumer Kafka idempotente** — `src/workers/checkout.consumer.ts:22-26`
- Se a mensagem for reentregue após `confirmed`, é ignorada.

**Producer idempotente** — `src/messaging/producer.ts:11` — `idempotent: true` previne envios duplicados em retry de rede.

### Ausente ou frágil

- **Janela SELECT-then-INSERT** — não é defeito: o UNIQUE no banco é o árbitro final.
- **Formato da chave não validado** — `VARCHAR(128)` aceita qualquer string; sem validação de UUID no schema/Zod.
- **Sem storage de idempotência separado** — chaves vivem só na tabela `orders`; limpeza de dados antigos
  poderia reabrir duplicatas (não crítico, pois orders são permanentes).
- **Header não obrigatório** — sem o header, gera UUID aleatório e cria pedido novo; recomendável exigir no OpenAPI.

---

## 3. Concorrência

### O que existe (sólido)

**Corrida pelo último item** — `src/repositories/product.repository.ts:37-38`
- Dois updates simultâneos avaliam o `WHERE` atomicamente dentro do UPDATE; no máximo N sucesso (N = estoque),
  os demais recebem `affectedRows = 0` → 409.
- Prova: `tests/stock.concurrency.test.ts:30-50` — 50 reservas concorrentes em 10 itens: exatamente 10 sucesso.

**Semântica InnoDB** — `REPEATABLE READ` default suficiente (sem dirty reads, snapshot consistente).
`src/repositories/product.repository.ts:28-30`.

**Single-flight lock (anti cache stampede)** — `src/cache/product.cache.ts:76-94`
- `SET LOCK_KEY "1" PX 5000 NX`: só um request vira líder; os demais aguardam a repopulação ou retornam stale.
- Timeout de 5s: se o líder cair, o lock expira.

**Contador de geração (anti escrita stale)** — `src/cache/product.cache.ts:29-38` (Lua)
- Escreve no cache só se a geração não mudou durante o load; senão descarta o snapshot obsoleto.
- Prova: `tests/product.cache.test.ts:103-118`.

**Kafka at-least-once + consumer idempotente**
- Producer idempotente; consumer checa status (`confirmed`) antes de processar.
- Offset commitado no sucesso; em crash a mensagem é reentregue.
- Após `CHECKOUT_MAX_ATTEMPTS` (`src/workers/checkout.consumer.ts:42`), pedido vira `failed`.

**Particionamento** — `src/messaging/admin.ts:12` — `numPartitions: 1` garante processamento sequencial por pedido.

### Ausente ou frágil

- **Sem row-level locking explícito** — por design (atomic UPDATE). Adequado.
- **Sem lock distribuído para o checkout** — só single-flight de cache. Idempotência multinível cobre.
- **Sem optimistic locking (version)** — não necessário.
- **Escala do consumer limitada** — partição única ⇒ 1 consumidor ativo; replicas extras ficam ociosas.
- **Sem DLQ real** — métrica `dead_letter` é emitida (`src/workers/checkout.consumer.ts:51`), mas não há
  tópico `.dlq`; a falha definitiva apenas comita o offset e reconcilia. Risco baixo (estoque é devolvido,
  sem perda silenciosa).
- **Tratamento de erro do consumer implícito** — confia no framework KafkaJS; sem try-catch explícito em
  `eachMessage` para erros inesperados.
- **Sem circuit breaker no ERP** — para simulação é aceitável; produção deveria falhar rápido.
- **Janela publish-após-persist** — ver "transactional outbox" na seção 1.
- **Sem métricas de contenção** — sem histograma de tempo de aquisição de lock nem contador de falhas de lock.

---

## Tabela-resumo

| Concern | Item | Status |
| --- | --- | --- |
| Estoque | Decremento atômico | ✅ Sólido |
| Estoque | Tudo-ou-nada (transação) | ✅ Sólido |
| Estoque | Liberação na falha | ✅ Sólido |
| Estoque | Reconciliação | ✅ Documentado (republish manual) |
| Estoque | Isolation level | ⚠️ Implícito |
| Estoque | Transactional outbox | ❌ Ausente (risco médio) |
| Idempotência | Header + UNIQUE no banco | ✅ Sólido |
| Idempotência | SELECT-then-INSERT | ✅ Seguro (UNIQUE é árbitro) |
| Idempotência | Liberação da duplicata | ✅ Sólido |
| Idempotência | Producer/Consumer Kafka | ✅ Sólido |
| Idempotência | Formato da chave | ⚠️ Sem validação |
| Concorrência | Atomic UPDATE | ✅ Provado por teste |
| Concorrência | Single-flight lock | ✅ Sólido |
| Concorrência | Contador de geração | ✅ Sólido |
| Concorrência | Ordenação por partição | ✅ Sólido |
| Concorrência | DLQ | ❌ Ausente (risco baixo) |
| Concorrência | Erro do consumer | ⚠️ Implícito |
| Concorrência | Escala do consumer | ⚠️ Limitada (1 partição) |

## Nível de risco

- 🟢 **Baixo (pronto p/ escala pequena–média):** overselling impossível, idempotência garantida por
  constraint, stampede prevenido, idempotência básica de Kafka funcionando.
- 🟡 **Médio (documentar e monitorar):** outbox, tratamento explícito de erro do consumer, isolation
  level explícito, DLQ, escala horizontal do worker.
- 🔴 **Alto:** nenhum identificado.

## Próximos passos recomendados (hardening — opcional)

1. **Transactional outbox** — order + evento Kafka na mesma transação; replay de não publicados no startup.
2. **Isolation level explícito** — declarar/documentar `READ COMMITTED` ou o default escolhido.
3. **Tópico DLQ** — rotear falhas definitivas para `checkout.requested.dlq` com monitoramento e replay.
4. **Erro do consumer** — envolver `processEvent` em try-catch com decisão explícita (retry ou DLQ).
5. **Formato da chave de idempotência** — validar no `checkoutSchema` (Zod) ou documentar a flexibilidade.
6. **Escala do Kafka** — se houver > 1 worker, aumentar partições com sharding por `orderId`.
7. **Métricas de lock** — histograma de aquisição e contador de contenção.
