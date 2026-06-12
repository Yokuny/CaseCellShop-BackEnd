import { randomUUID } from "node:crypto";
import { invalidateCatalog } from "../cache";
import { returnData, type ServiceRes } from "../helpers";
import { getContext, logger, setOrderId } from "../logger";
import { publishCheckoutRequested } from "../messaging";
import { ordersTotal, stockReservations } from "../metrics";
import type { Checkout } from "../models";
import * as orderRepository from "../repositories/order.repository";
import * as productRepository from "../repositories/product.repository";

export const createCheckout = async (data: Checkout, idempotencyKey: string): Promise<ServiceRes> => {
  // 1. Idempotência (duplo clique / retry) — chave única no banco é o árbitro final.
  const existing = await orderRepository.findByIdempotencyKey(idempotencyKey);
  if (existing) {
    ordersTotal.inc({ status: "idempotent_hit" });
    logger.info({ orderId: existing.id, idempotencyKey }, "[CHECKOUT] hit idempotente");
    return returnData({ orderId: existing.id, status: existing.status });
  }

  // 2. Reserva de estoque atômica (valida produtos e preços; lança 404/409).
  let items: Awaited<ReturnType<typeof productRepository.reserveStock>>;
  try {
    items = await productRepository.reserveStock(data.items);
    stockReservations.inc({ result: "reserved" });
  } catch (e) {
    stockReservations.inc({ result: "insufficient" });
    throw e;
  }

  const total = Number(items.reduce((acc, it) => acc + it.price * it.quantity, 0).toFixed(2));
  const orderId = randomUUID();

  // 3. Persiste o pedido. Se perder a corrida da idempotência, devolve o estoque.
  const created = await orderRepository.create({ id: orderId, idempotencyKey, items, total });
  if (!created) {
    await productRepository.releaseStock(items);
    stockReservations.inc({ result: "released" });
    const winner = await orderRepository.findByIdempotencyKey(idempotencyKey);
    ordersTotal.inc({ status: "idempotent_hit" });
    return returnData({ orderId: winner?.id ?? orderId, status: winner?.status ?? "pending" });
  }

  setOrderId(orderId);
  // Disponibilidade mudou → invalida a vitrine cacheada.
  await invalidateCatalog();

  // 4. Publica o evento (após persistir).
  const correlationId = getContext()?.correlationId ?? randomUUID();
  await publishCheckoutRequested({ orderId, correlationId });

  ordersTotal.inc({ status: "accepted" });
  logger.info({ orderId, total }, "[CHECKOUT] pedido aceito e publicado");
  return returnData({ orderId, status: "pending" });
};
