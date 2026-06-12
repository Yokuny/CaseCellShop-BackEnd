import type { Consumer } from "kafkajs";
import { env, kafka, TOPICS } from "../config";
import { logger, runWithContext } from "../logger";
import { checkoutProcessing, kafkaMessages, ordersTotal, stockReservations } from "../metrics";
import type { CheckoutRequestedEvent } from "../models";
import * as orderRepository from "../repositories/order.repository";
import * as productRepository from "../repositories/product.repository";
import { billOnErp } from "../services/erp.service";

let consumer: Consumer | null = null;

const processEvent = async (event: CheckoutRequestedEvent): Promise<void> => {
  const { orderId } = event;

  const order = await orderRepository.findById(orderId);
  if (!order) {
    logger.warn({ orderId }, "[WORKER] pedido não encontrado, ignorando mensagem");
    return;
  }

  // Idempotência de processamento: se já foi confirmado, não refatura em reentrega.
  if (order.status === "confirmed") {
    logger.info({ orderId }, "[WORKER] pedido já confirmado, ignorando reentrega");
    return;
  }

  const attempt = order.attempts + 1;
  await orderRepository.updateStatus(orderId, "processing", { incrementAttempts: true });
  const stop = checkoutProcessing.startTimer();

  try {
    await billOnErp(order);
    await orderRepository.updateStatus(orderId, "confirmed", { errorReason: null });
    ordersTotal.inc({ status: "confirmed" });
    stop({ result: "confirmed" });
    kafkaMessages.inc({ topic: TOPICS.checkoutRequested, result: "consumed" });
    logger.info({ orderId, attempt }, "[WORKER] checkout confirmado");
  } catch (e) {
    const reason = (e as Error).message;

    if (attempt >= env.CHECKOUT_MAX_ATTEMPTS) {
      // Falha definitiva: marca como failed e reconcilia (devolve o estoque reservado).
      await orderRepository.updateStatus(orderId, "failed", { errorReason: reason });
      await productRepository.releaseStock(order.items);
      stockReservations.inc({ result: "released" });
      ordersTotal.inc({ status: "failed" });
      stop({ result: "failed" });
      kafkaMessages.inc({ topic: TOPICS.checkoutRequested, result: "dead_letter" });
      logger.error({ orderId, attempt, reason }, "[WORKER] checkout falhou definitivamente, estoque reconciliado");
      return; // commit do offset: não reprocessa
    }

    // Falha transitória: deixa o Kafka reentregar a mensagem (não comita o offset).
    kafkaMessages.inc({ topic: TOPICS.checkoutRequested, result: "retried" });
    stop({ result: "retry" });
    logger.warn({ orderId, attempt, reason }, "[WORKER] falha transitória, será reprocessado");
    throw e;
  }
};

export const startCheckoutConsumer = async (): Promise<void> => {
  consumer = kafka.consumer({ groupId: env.KAFKA_CONSUMER_GROUP });
  await consumer.connect();
  await consumer.subscribe({ topic: TOPICS.checkoutRequested, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      const event = JSON.parse(message.value.toString()) as CheckoutRequestedEvent;
      // Restaura o correlationId da mensagem para correlacionar logs request→worker.
      await runWithContext({ correlationId: event.correlationId, orderId: event.orderId }, () => processEvent(event));
    },
  });

  logger.info({ topic: TOPICS.checkoutRequested, group: env.KAFKA_CONSUMER_GROUP }, "[KAFKA] consumer de checkout iniciado");
};

export const stopCheckoutConsumer = async (): Promise<void> => {
  if (consumer) {
    await consumer.disconnect();
    consumer = null;
  }
};
