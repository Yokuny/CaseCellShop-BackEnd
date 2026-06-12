import { Kafka, logLevel } from "kafkajs";
import { env } from "./env.config";

export const TOPICS = {
  checkoutRequested: "checkout.requested",
} as const;

export const kafka = new Kafka({
  clientId: env.KAFKA_CLIENT_ID,
  brokers: env.KAFKA_BROKERS.split(",").map((b) => b.trim()),
  logLevel: logLevel.NOTHING,
  retry: {
    initialRetryTime: 300,
    retries: 8,
  },
});
