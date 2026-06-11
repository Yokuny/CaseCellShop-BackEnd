# PROMPTS.md

Registro do uso de IA (Claude) na construção da mini-tarefa, conforme pedido no desafio. A IA foi usada com critério: as decisões de arquitetura, stack e trade-offs foram revisadas e validadas a cada etapa.

# Analise a arquitetura em camadas (layered architecture) deste projeto usando o módulo "products" como referência, para criação de skill expert neste processo:

-Routes — registro do grupo de rotas em ./app.ts e definição dos endpoints em ./src/routes/products.route.ts, incluindo a cadeia de middlewares (autenticação, etc.) e a validação de entrada via middleware com schemas Zod (./src/schemas).
-Controller (./src/controllers/product.controller.ts) — normalização básica de dados (ex.: toLowerCase em e-mails), tratamento global de erros (try/catch centralizado) e padronização da resposta HTTP conforme o contrato definido em ./src/helpers/responsePattern.helper.ts.
-Service (./src/services/product.service.ts) — camada de regras de negócio. Única camada autorizada a consumir o Repository; valida, processa e orquestra operações, além de disparar eventos assíncronos (filas/mensageria).
-Repository (./src/repositories/product.repository.ts) — abstração exclusiva de acesso ao banco de dados (todas as queries/operações de persistência).

-Camadas de suporte: ./src/middlewares, ./src/schemas, ./src/messaging, ./src/cache e ./src/models (definição de novos schemas/entidades do banco, quando necessário).
Com base nesse mapeamento, crie uma skill expert que documente esses padrões e convenções para servir de guia na criação de novos módulos do sistema.

Voce é expert na criação de skill e sabe que para criar bons skill e que não consuma muitos tokens faça-o em menos de 200 linhas e se necessario com arquivos load-on-demand para referenciar informações completas