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

# openapi-setup

Configure a documentação automatizada do OpenAPI (Swagger) deste projeto NodeJS e Express, utilizando o Zod como a fonte única da verdade para os contratos. Torne o processo automatizada sem necessidade de escrever JSON ou YAML na mão.

Por favor, gere a estrutura de arquivos e o código necessário seguindo exatamente as diretrizes abaixo:

1. DEPENDÊNCIAS DO PROJETO:
Considere o uso das seguintes bibliotecas:
- `zod` (para validação)
- `@asteasolutions/zod-to-openapi` (para estender o zod e gerar o registro)
- `swagger-ui-express` (para expor a interface gráfica)

2. REGRAS DE ARQUITETURA (OBRIGATÓRIO):
- Instanciação do Zod: Crie um arquivo centralizado (ex: `src/schemas/zod.ts`) que execute `extendZodWithOpenApi(z)` e reexporte o `z`. Todos os outros arquivos do projeto devem importar o 'z' deste arquivo customizado, e NUNCA direto do pacote 'zod'
- Schemas e DTOs devem ficar isolados em (ex: `src/schemas/`).
- Helper de Erro: Crie um helper (ex: `jsonError`) para padronizar e reutilizar o schema de respostas de erro (ex: 400, 404, 500) sem repetir código em cada endpoint.

3. Crie:
- `schemas/zod.ts`: Setup inicial estendendo o Zod.
- `schemas/error.schema.ts`: Schema padrão do envelope de erro da API.
- Crie os middlewares do Express para expor o JSON em `/openapi.json` e a UI em `/docs`.

# Crie os módulos de `checkout` e `orders`

Use a skill `new-module` (`./.claude/skills/new-module/SKILL.md`), que é expert na criação de novos módulos neste projeto, para manter a consistência e o padrão da arquitetura em camadas (Route → Controller → Service → Repository), espelhando o módulo `products`.

- Verifique no commit anterior SHA e75f51e2cca83fa5cf51ae00ca1b305dc9e3046d para verificar oque é necessario também para criar o processo automatizado de documentação com a lib de OpenAPI.
- Para detalhes aprofundados confira o arquivo `Desafio.md`

- Crie `POST /checkout` inicia uma compra e retorna **202 Accepted** com `orderId`/`status` (contrato assíncrono).
- Crie a rota `GET /orders/{orderId}/status` que permite acompanhar o processamento do pedido.
