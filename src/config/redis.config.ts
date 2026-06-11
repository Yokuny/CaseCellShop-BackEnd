import Redis, { type RedisOptions } from "ioredis";
import { logger } from "../logger";
import { env } from "./env.config";

export const redisOptions: RedisOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  // Conecta sob demanda para não poluir os logs quando o Redis ainda não subiu.
  lazyConnect: true,
};

export const redis = new Redis(redisOptions);

redis.on("error", (err) => {
  logger.warn({ err: err.message }, "[REDIS] erro de conexão");
});

export const redisConnect = async (): Promise<void> => {
  await redis.connect();
  const pong = await redis.ping();
  logger.info({ host: env.REDIS_HOST, port: env.REDIS_PORT }, `[REDIS] conectado (${pong})`);
};

export const redisDisconnect = async (): Promise<void> => {
  await redis.quit();
};
