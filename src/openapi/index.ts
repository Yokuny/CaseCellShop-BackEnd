import type { Application, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import { buildOpenApiDocument } from "./document";

export { buildOpenApiDocument } from "./document";

// Monta a documentação OpenAPI: Swagger UI em /docs e o JSON cru em /openapi.json.
export const setupOpenApi = (app: Application): void => {
  const document = buildOpenApiDocument();
  app.get("/openapi.json", (_req: Request, res: Response) => res.json(document));
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(document, { customSiteTitle: "CaseCellShop API" }));
};
