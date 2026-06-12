# Os 3 problemas identificados
- Com o aumento drástico de acessos, três ofensores principais foram identificados:
## 01 | Performance da vitrine
A vitrine consulta o ERP a cada acesso e fica lenta. O negócio precisa reduzir latência sem perder
controle sobre preço e disponibilidade.
## 02 | Consistência de estoque
Clientes compram o mesmo item sem estoque. A solução precisa reduzir o risco de overselling no
checkout.
## 03 | Resiliência do checkout
A API do ERP demora para faturar o pedido. A jornada precisa tolerar timeout, retry e processamento
assíncrono com rastreabilidade suficiente.
---
# Pergunta 1 — Diagnóstico, trade-offs e arquitetura alvo
## - O que você acredita estar causando o problema na raiz?
**A respeito de Performance da vitrine:**
Acredito que a causa raiz esta nas consultas ao ERP, no caso da lentidão, pois o sistema integrado do ERP provavelmente não faz processo de cacheamento, e sempre que o usuario acessa a pagina um novo processo de busca é feito entre o sistema e o sistema do ERP;
**Respondendo a respeito de Consistência de estoque:**
O problema pode estár na falta de invalidação ou atualização dos dados no cacheamento. Durante o processo de venda, os novos dados de saldo não estão sendo repassados para atualizar o cache, fazendo com que o cliente veja e compre um estoque que já acabou.
Ou, caso o sistema nem use cache para isso, acredito que o problema seja que não está sendo feita uma busca direto nos valores atuais salvos no banco de dados para a checagem em tempo real do estoque na hora do clique final, deixando a compra passar com dados antigos.
**Resposta a respeito do topico 3 - Resiliência do checkout:**
Acredito que a causa raiz está no front-end ficar travado aguardando a confirmação da operação de faturamento do pedido em tempo real. Para resolver isso, durante o processo podemos implementar diversas checagens em paralelo dentro de um Promise.all no back-end, evitando ter que esperar uma operação por vez; se alguma tarefa essencial falhar ou retornar um erro que impeça o faturamento, já retornamos o erro de vez para o usuário sem perda de tempo.
E, além disso, a solução definitiva é usar processos de filas para receber o pedido e avisar logo ao usuário que o faturamento vai acontecer de forma assíncrona posteriormente, e que ele será notificado por algum aviso (como e-mail ou notificação), em vez de deixá-lo travado e esperando na página de checkout.

**Visão de arquitetura de 30 a 90 dias**, uma solução que sugiro é criar um banco de dados próprio para a loja funcionando como um `read model`, que deve ser atualizado com novos dados sempre que o ERP for atualizado, evitando fazer consultas diretas a ele;
Antes da consulta a esse banco podemos colocar um processo de cacheamento para a vitrine consultar os dados de preço e saldo;
Para o checkout marcamos o pedido como pendente e jogamos em uma fila de mensagens para um worker processar o faturamento com o ERP de forma assíncrona, liberando o usuário na tela em vez de deixá-lo travado, se trazermos dados suficientes para o sistema que faz conexão com o front-end podemos tambem fazer mais checagens previamente antes de repassar ao ERP o faturamento;
Para garantir o controle dos processos podemos implementar processos de observabilidade com logs estruturados e configurando alertas caso aconteça anormalidades ou erros interno, como por exemplo no ERP com timeout

## - Qual é o impacto para o cliente, para o negócio e para a operação?
**Para o cliente:** página lenta gera frustração e abandono, e o pior cenário é ele pagar por um produto que não existe no estoque e ter a compra cancelada depois, quebrando a confiança na loja.

**Para o negócio:** perda direta de vendas pelo abandono, custo com estornos e cancelamentos por overselling, e dano de reputação que é mais caro de recuperar do que qualquer correção técnica.

**Para a operação:** o ERP fica sobrecarregado recebendo consultas de milhões de acessos, o time gasta tempo resolvendo manualmente pedidos sem estoque, e sem rastreabilidade fica difícil até saber onde o problema começou.

## - Compare pelo menos 2 caminhos de solução
**Vitrine:**
- **Caminho 1 — Cache (Redis) na frente do ERP:** baixo custo, baixa complexidade e ganho imediato de latência. O trade-off é a consistência eventual, o dado pode ficar levemente desatualizado dentro do TTL.
- **Caminho 2 — Read model próprio sincronizado com o ERP:** mais esforço e complexidade (precisa de sincronização e reconciliação), porém tira o ERP do caminho da leitura de vez e escala muito melhor.
- Minha escolha é começar pelo cache por ser rápido de entregar, e evoluir para o read model dentro da janela de 30 a 90 dias.

**Estoque:**
- **Caminho 1 — Atomic update condicional no banco:** simples, barato e resolve a condição de corrida na raiz. É o que eu implementaria primeiro.
- **Caminho 2 — Reserva de estoque com expiração:** melhor experiência (segura o item durante o checkout), porém exige mais esforço: tabela de reservas e worker para liberar reservas expiradas.

**Checkout:**
- **Caminho 1 — Aumentar timeout e adicionar retry síncrono:** esforço quase zero, mas não resolve a raiz, só empurra o problema e ainda piora sob carga.
- **Caminho 2 — Fila + worker assíncrono com status de pedido:** mais esforço de implementação, mas desacopla a jornada do cliente da lentidão do ERP. É o caminho correto.
---
# Pergunta 2 — Cache, invalidação e performance da vitrine
## - Onde colocaria cache?
- **CDN/edge:** para assets e respostas de catálogo que mudam pouco, corta requisição antes mesmo de chegar no back-end.
- **Redis (cache distribuído):** camada principal para produto, preço e disponibilidade, compartilhada entre as instâncias da API.
- **Read model:** não é cache, mas funciona como fallback quando a chave não está no Redis, evitando bater no ERP.

## - TTL, invalidação, fallback e stampede
- **TTL:** catálogo e preço com TTL de alguns minutos; disponibilidade com TTL curto (segundos) ou invalidação por evento a cada venda confirmada.
- **Estratégia:** cache-aside — busca no cache, se der miss busca no read model, grava no cache e responde.
- **Invalidação:** por evento, quando preço ou saldo muda no fluxo de venda/sincronização, invalidamos ou atualizamos a chave na hora em vez de esperar o TTL.
- **Fallback:** se o Redis cair, a API vai direto no read model; se a fonte estiver indisponível, servimos o dado do cache mesmo vencido (stale-while-revalidate) para não derrubar a vitrine.
- **Stampede:** uso de lock/single-flight para que apenas uma requisição reconstrua a chave expirada enquanto as outras esperam ou recebem o valor antigo, e refresh em background das chaves mais acessadas antes de expirarem.

## - Métricas para validar o ganho
- **Performance/custo:** hit rate do cache, latência p95/p99 da vitrine antes e depois, e número de requisições ao ERP/read model por minuto (quanto menor, menor o custo).
- **Dado velho/incorreto:** idade média do dado servido (staleness), job amostral comparando cache x fonte para medir divergência, e contagem de checkouts negados por estoque divergente. Se o hit rate sobe mas a divergência também, o TTL está longo demais.
---
# Pergunta 3 — Observabilidade, Datadog ou equivalente
## - Logs estruturados
Logs em JSON com campos obrigatórios: `timestamp`, `trace_id` (correlation id), `order_id`, `product_id`, `rota`, `status_code`, `latency_ms`, `resultado` (sucesso/erro/timeout) e `origem_do_dado` (cache/read-model/erp). Com isso conseguimos rastrear qualquer pedido ou produto de ponta a ponta.

## - Métricas
- **Counters:** `cache_hit`, `cache_miss`, `checkout_criado`, `checkout_falha`, `erp_timeout`, `mensagens_dlq`.
- **Gauges:** tamanho da fila, lag do worker, pedidos em status pendente.
- **Histograms:** latência do `GET /products`, latência do `POST /checkout`, e tempo de faturamento no ERP.

## - Traces/spans
- **GET /products:** span do handler → span do lookup no cache → span do read model (quando miss).
- **POST /checkout:** span da validação/decremento de estoque → span da gravação do pedido → span da publicação na fila; no worker, span do consumo → span da chamada ao ERP → span da atualização de status, todos ligados pelo mesmo `trace_id` da requisição original.

## - SLI/SLO, alertas e dashboard
- **SLIs/SLOs:** p95 da vitrine < 300ms, disponibilidade 99.9%, % de pedidos faturados em até X minutos, taxa de overselling = 0.
- **Alertas:** p95 acima do limite, fila crescendo sem consumo, DLQ > 0, taxa de timeout do ERP acima de N%.
- **Dashboard:** latência da vitrine, hit rate do cache, tamanho da fila e lag, pedidos por status e erros do ERP. Com isso a liderança enxerga a degradação antes do cliente reclamar.
---
# Pergunta 4 — Concorrência, estoque e idempotência
## - Por que checagem simples é insuficiente?
Porque ler o saldo e depois gravar a venda são duas operações separadas: entre a leitura e a escrita, outra requisição concorrente compra o mesmo item. Sob milhões de acessos essa janela de corrida acontece o tempo todo.

**Comparando as abordagens:**
- **Atomic update condicional:** `UPDATE estoque SET saldo = saldo - qtd WHERE id = ? AND saldo >= qtd`. O próprio banco garante a atomicidade; se nenhuma linha for afetada, não há estoque. Simples, barato e é minha escolha para o escopo.
- **Lock pessimista (SELECT FOR UPDATE):** também garante, mas serializa as transações e degrada a performance sob alta concorrência.
- **Reserva de estoque:** reserva com expiração no início do checkout e confirmação no faturamento. Melhor experiência, porém mais complexidade (worker para expirar reservas).
- **Distributed lock (Redis):** só faz sentido se o estoque não viver em um banco transacional único, por exemplo múltiplos serviços escrevendo. No nosso cenário adiciona complexidade e ponto de falha sem necessidade.

## - Idempotência e testes
O cliente envia um `Idempotency-Key` no `POST /checkout`; guardamos a chave junto com o resultado, e qualquer retry, duplo clique ou reprocessamento com a mesma chave retorna o mesmo pedido em vez de criar outro. No worker, a mensagem só é processada se o pedido ainda estiver no status esperado, tornando o consumo idempotente.

**Para testar no escopo do desafio:** disparo N requisições paralelas para um produto com saldo menor que N e valido que o saldo nunca fica negativo e que só a quantidade exata de pedidos passa; e repito o mesmo `Idempotency-Key` várias vezes validando que apenas um pedido foi criado.
---
# Pergunta 5 — Mensageria, resiliência, contrato e IA
## - Publicar antes ou depois de gravar o pedido?
Gravo o pedido primeiro com status `PENDENTE` e publico na fila depois. Os dois riscos e como reduzo cada um:
- **Pedido fantasma** (gravou e não publicou): job de varredura/outbox que reencaminha pedidos pendentes sem mensagem publicada após X tempo.
- **Mensagem fantasma** (mensagem sem pedido): como o pedido sempre é gravado antes, o worker valida a existência do pedido antes de processar e descarta/loga a mensagem se não encontrar.

## - Retry e status do pedido
Retry no worker com backoff exponencial e limite de tentativas; estourou o limite, a mensagem vai para a DLQ e gera alerta. Status do pedido: `PENDENTE → PROCESSANDO → FATURADO` ou `FALHA`, consultável via `GET /orders/{id}`.

## - OpenAPI e testes
Contrato OpenAPI documentando `GET /products`, `POST /checkout` (retornando `202` com `order_id`) e `GET /orders/{id}`. Testes unitários do decremento atômico e da idempotência, e teste de integração do fluxo completo fila → worker → atualização de status.

## - Prompts de IA
Usei IA como acelerador, não como decisor: prompts para revisar trade-offs de arquitetura, gerar boilerplate (setup do projeto, contrato OpenAPI, casos de teste) e gerar cenários de teste de concorrência. Todo código gerado foi revisado e validado por mim antes de entrar na solução.