import type { Producer } from "kafkajs";
import { kafka, TOPICS } from "../config";
import { logger } from "../logger";
import { kafkaMessages } from "../metrics";
import type { CheckoutRequestedEvent } from "../models";

let producer: Producer | null = null;

export const connectProducer = async (): Promise<void> => {
  // Producer idempotente: evita mensagens duplicadas em retry de envio.
  producer = kafka.producer({ allowAutoTopicCreation: true, idempotent: true });
  await producer.connect();
  logger.info("[KAFKA] producer conectado");
};

export const publishCheckoutRequested = async (event: CheckoutRequestedEvent): Promise<void> => {
  if (!producer) throw new Error("Kafka producer não inicializado");
  await producer.send({
    topic: TOPICS.checkoutRequested,
    messages: [{ key: event.orderId, value: JSON.stringify(event) }],
  });
  kafkaMessages.inc({ topic: TOPICS.checkoutRequested, result: "produced" });
};

export const disconnectProducer = async (): Promise<void> => {
  if (producer) {
    await producer.disconnect();
    producer = null;
  }
};
