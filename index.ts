import app, { init } from "./app";
import { env, mysqlDisconnect, redisDisconnect } from "./src/config";
import { logger } from "./src/logger";
import { disconnectProducer } from "./src/messaging";
import metricsApp from "./src/metrics";
import { stopCheckoutConsumer } from "./src/workers/checkout.consumer";

const port = Number(env.PORT) || 8080;
const metricsPort = Number(env.METRICS_PORT) || 9100;

init()
  .then(() => {
    const server = app.listen(port, () => {
      logger.info(`[LOG] API em http://localhost:${port} — docs em /docs`);
    });

    const metricsServer = metricsApp.listen(metricsPort, () => {
      logger.info(`[LOG] Métricas em http://localhost:${metricsPort}/metrics`);
    });

    const gracefulShutdown = async (signal: string) => {
      logger.info({ signal }, "[LOG] encerrando graciosamente...");
      server.close();
      metricsServer.close();
      await stopCheckoutConsumer();
      await disconnectProducer();
      await redisDisconnect();
      await mysqlDisconnect();
      process.exit(0);
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  })
  .catch((e) => {
    logger.fatal({ err: (e as Error).message }, "[LOG] falha na inicialização");
    process.exit(1);
  });
