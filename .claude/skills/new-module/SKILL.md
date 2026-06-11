---
name: new-module
description: >
  Guia para criar novos módulos no backend CaseCellShop seguindo a arquitetura em camadas
  (Route → Controller → Service → Repository → MySQL/Redis/Kafka). Use sempre que o usuário
  pedir um novo módulo, recurso, domínio ou conjunto de endpoints — ex.: "crie o módulo de
  reviews", "adicione um CRUD de categorias", "preciso de endpoints para cupons", "implementa
  o domínio de usuários" — mesmo sem mencionar "new-module".
---

# Criação de Módulos — CaseCellShop

Cada módulo replica a estrutura do módulo `products`. **A referência é o código existente:**
leia o arquivo correspondente do `products` e espelhe-o para o novo domínio. Não invente
padrões novos — copie os que estão lá.

## Regras invioláveis

1. Services **não** importam outros `.service.ts` — compartilham via repositories.
2. SQL só em `repositories/` e `database/`. Redis só em `cache/`. Kafka só em `messaging/` e `workers/`.
3. `z` vem de `"./zod"` (habilita `.openapi()`), nunca do pacote `zod`.
4. Zod é a fonte do contrato — sem validação manual duplicada.
5. Tudo é exportado via barrel `index.ts` da pasta.
6. Controller não tem regra de negócio; service não fala HTTP; repository não tem regra de negócio.

## Antes de gerar

Leia os arquivos do `products` como template e pergunte ao usuário o que não estiver claro
(operações CRUD necessárias? precisa de cache? há evento Kafka? relações com outros módulos?).

| Camada | Arquivo de referência | O que copiar |
| --- | --- | --- |
| Schema | [src/schemas/product.schema.ts](../../src/schemas/product.schema.ts) | entidade `.openapi("Nome")` + response + `create*Schema` + tipos inferidos |
| Param schema | [src/schemas/id.schema.ts](../../src/schemas/id.schema.ts) | `<entity>IdParamSchema` para rotas com `:id` |
| Domain type | [src/models/domain.types.ts](../../src/models/domain.types.ts) | interface TS da entidade (camelCase) |
| Repository | [src/repositories/product.repository.ts](../../src/repositories/product.repository.ts) | mapper `to<Entity>(row)`, `findAll`/`findById`, `pool`, `CustomError` |
| Service | [src/services/product.service.ts](../../src/services/product.service.ts) | retorna `ServiceRes` via `returnData`/`returnDataMessage`; `CustomError(msg, status)` |
| Controller | [src/controllers/product.controller.ts](../../src/controllers/product.controller.ts) | handlers com `try/catch` → `next(e)`, resposta `respObj(resp)` |
| Router | [src/routers/products.route.ts](../../src/routers/products.route.ts) | `validBody`/`validParams`/`validQuery` **antes** do controller |

Fluxo assíncrono (só se houver Kafka): espelhe
[src/services/checkout.service.ts](../../src/services/checkout.service.ts) e
[src/workers/checkout.consumer.ts](../../src/workers/checkout.consumer.ts) (idempotência,
retry transitório com `throw e`, dead-letter ao atingir `MAX_ATTEMPTS`, reconciliação).

## Ordem de criação

Schema → param schema → domain type → repository → service → controller → router. Em cada
arquivo, o naming segue o padrão do `products` (`<entity>.schema.ts`, `to<Entity>`, etc.).

## Pontos de integração — onde é fácil esquecer

Gerar os 7 arquivos da camada **não basta**. O módulo só fica conectado se você também editar:

1. **`src/schemas/index.ts`** — re-exportar os schemas e tipos novos.
2. **`src/models/index.ts`** — re-exportar a interface da entidade (e o evento, se houver).
3. **`src/routers/index.ts`** — re-exportar a `<module>Route`.
4. **`app.ts`** (raiz) — montar a rota: `.use("/<plural>", route.<module>Route)`.
5. **`src/openapi/registry.ts`** — `registry.registerPath({...})` para cada endpoint
   (reuse o helper `jsonError`); importar os schemas usados.
6. **`src/openapi/document.ts`** — adicionar `{ name: "<Plural>", description: "..." }` em `tags`.
7. **`src/database/schema.ts`** — este projeto **não usa migrations separadas**: adicione o
   DDL idempotente (`CREATE TABLE IF NOT EXISTS ...`) e chame `await pool.query(<NOME>_DDL)`
   dentro de `ensureSchema()`. Colunas em `snake_case`.

Se o módulo tiver Kafka, também:

8. **`src/config/kafka.config.ts`** — adicionar o tópico em `TOPICS`.
9. **`src/messaging/producer.ts`** — `publish<Evento>(event)` + métrica `kafkaMessages.inc`.
10. **`src/messaging/admin.ts`** — incluir o tópico em `ensureTopics` (createTopics).
11. **`src/messaging/index.ts`** — re-exportar a função `publish*`.
12. **`src/workers/<module>.consumer.ts`** — criar o consumer; conectá-lo em `init()` no `app.ts`.

Cache Redis é opcional (listagens públicas de alto tráfego): espelhe
[src/cache/product.cache.ts](../../src/cache/product.cache.ts) (fresh/stale/lock,
single-flight, `invalidate*` após writes) e registre no barrel `src/cache/index.ts`.

## Antes de entregar

Confirme que: schema/model/repo/service/controller/router criados; os 7 pontos de integração
feitos (8–12 se Kafka); naming espelha o `products`; DDL adicionado ao `database/schema.ts`.

Apresente um resumo: **arquivos criados**, **arquivos modificados** e **próximos passos**
(ex.: seed de dados, rodar `pnpm dev` para validar). Não esqueça nenhum dos pontos de integração
— é o erro mais comum e quebra o módulo silenciosamente.
