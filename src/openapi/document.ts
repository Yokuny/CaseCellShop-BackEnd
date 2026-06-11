import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { registry } from "./registry";

// Gera o documento OpenAPI 3.0 a partir dos schemas Zod (fonte única do contrato).
export const buildOpenApiDocument = () => {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: "3.0.3",
    info: {
      title: "CaseCellShop API",
      version: "1.0.0",
      description: "Catálogo com cache (Redis), checkout assíncrono (Kafka) e consulta de status de pedidos (MySQL).",
    },
    servers: [{ url: "http://localhost:8080", description: "Dev" }],
    tags: [
      { name: "Products", description: "Vitrine / catálogo" },
      { name: "Checkout", description: "Início do checkout assíncrono" },
      { name: "Orders", description: "Status dos pedidos" },
    ],
  });
};
