import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  PORT: z.string().default("8080"),
  METRICS_PORT: z.string().default("9100"),

  // MySQL — read-model do catálogo (simula o ERP) + pedidos.
  MYSQL_HOST: z.string().default("localhost"),
  MYSQL_PORT: z.coerce.number().default(3306),
  MYSQL_USER: z.string().default("casecellshop"),
  MYSQL_PASSWORD: z.string().default("casecellshop"),
  MYSQL_DATABASE: z.string().default("casecellshop"),

  // Redis — cache do catálogo.
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // Kafka — checkout assíncrono.
  KAFKA_BROKERS: z.string().default("localhost:29092"),
  KAFKA_CLIENT_ID: z.string().default("casecellshop-backend"),
  KAFKA_CONSUMER_GROUP: z.string().default("checkout-worker"),

  // Cache: TTL do catálogo (s) e TTL da cópia "stale" para fallback (s).
  PRODUCT_CACHE_TTL: z.coerce.number().default(30),
  PRODUCT_CACHE_STALE_TTL: z.coerce.number().default(300),

  // Resiliência do worker de checkout (simulação do faturamento no ERP).
  CHECKOUT_MAX_ATTEMPTS: z.coerce.number().default(3),
  ERP_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0),
});

export const env = envSchema.parse(process.env);

export const isTest = env.NODE_ENV === "test";
