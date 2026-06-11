import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import {
  checkoutResponseSchema,
  checkoutSchema,
  errorResponseSchema,
  orderIdParamSchema,
  orderStatusResponseSchema,
  productIdParamSchema,
  productSchema,
  productsResponseSchema,
  z,
} from "../schemas";

export const registry = new OpenAPIRegistry();

const jsonError = (description: string) => ({
  description,
  content: { "application/json": { schema: errorResponseSchema } },
});

registry.registerPath({
  method: "get",
  path: "/products",
  tags: ["Products"],
  summary: "Lista o catálogo de produtos (servido via cache com TTL)",
  responses: {
    200: { description: "Catálogo de produtos", content: { "application/json": { schema: productsResponseSchema } } },
    500: jsonError("Erro interno"),
  },
});

registry.registerPath({
  method: "get",
  path: "/products/{id}",
  tags: ["Products"],
  summary: "Detalhe de um produto",
  request: { params: productIdParamSchema },
  responses: {
    200: { description: "Produto", content: { "application/json": { schema: z.object({ success: z.literal(true), data: productSchema, message: z.string() }) } } },
    404: jsonError("Produto não encontrado"),
  },
});

registry.registerPath({
  method: "post",
  path: "/checkout",
  tags: ["Checkout"],
  summary: "Inicia um checkout assíncrono",
  description: "Reserva estoque atomicamente, persiste o pedido e publica em Kafka. Aceita o header `Idempotency-Key` para tolerar retry/duplo clique.",
  request: {
    headers: z.object({ "Idempotency-Key": z.string().uuid().optional() }),
    body: { content: { "application/json": { schema: checkoutSchema } } },
  },
  responses: {
    202: { description: "Checkout aceito; processamento assíncrono", content: { "application/json": { schema: checkoutResponseSchema } } },
    400: jsonError("Payload inválido"),
    404: jsonError("Produto não encontrado"),
    409: jsonError("Estoque insuficiente"),
  },
});

registry.registerPath({
  method: "get",
  path: "/orders/{orderId}/status",
  tags: ["Orders"],
  summary: "Consulta o status de um pedido",
  request: { params: orderIdParamSchema },
  responses: {
    200: { description: "Status do pedido", content: { "application/json": { schema: orderStatusResponseSchema } } },
    404: jsonError("Pedido não encontrado"),
  },
});
