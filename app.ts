import cors from "cors";
import type { Application, Request, Response } from "express";
import express, { json, urlencoded } from "express";

import { corsOptions, mysqlConnect, redisConnect } from "./src/config";
import { ensureSchema } from "./src/database";
import { logger } from "./src/logger";
import { connectProducer, ensureTopics } from "./src/messaging";
import { correlationId, errorHandler, requestLogger, responseTime } from "./src/middlewares";
import { setupOpenApi } from "./src/openapi";
import * as route from "./src/routers";
import { startCheckoutConsumer } from "./src/workers/checkout.consumer";

const app: Application = express();

app.set("trust proxy", 1);

app
  .use(urlencoded({ extended: false }))
  .use(json())
  .use(cors(corsOptions))
  .use(correlationId)
  .use(requestLogger)
  .get("/", (_req: Request, res: Response) => {
    res.send("Bem-vindo à API da CaseCellShop! Veja a documentação em /docs");
  })
  .get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok", timestamp: new Date() });
  })
  .use(responseTime)
  .use("/products", route.productsRoute)
  .use("/checkout", route.checkoutRoute)
  .use("/orders", route.ordersRoute);

// Documentação OpenAPI: /docs (Swagger UI) e /openapi.json.
setupOpenApi(app);

app.use((_req: Request, res: Response) => {
  res.status(404).send({ success: false, message: "Rota não encontrada! 🤷‍♂️" });
});

app.use(errorHandler);

// Inicializa a infraestrutura antes de aceitar tráfego: MySQL (+ schema/seed),
// Redis (cache), producer Kafka e o worker consumidor do checkout.
export async function init(): Promise<Application> {
  await mysqlConnect();
  await ensureSchema();
  await redisConnect();
  await ensureTopics();
  await connectProducer();
  await startCheckoutConsumer();
  logger.info("[INIT] dependências prontas");
  return app;
}

export default app;
