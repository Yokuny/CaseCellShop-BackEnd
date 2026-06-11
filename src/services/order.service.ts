import { returnData, type ServiceRes } from "../helpers";
import { CustomError } from "../models";
import * as repository from "../repositories/order.repository";

// GET /orders/:orderId/status — acompanhamento do processamento assíncrono.
export const getOrderStatus = async (orderId: string): Promise<ServiceRes> => {
  const order = await repository.findById(orderId);
  if (!order) throw new CustomError("Pedido não encontrado", 404);

  // Não expomos a idempotencyKey na resposta pública.
  const { idempotencyKey: _omit, ...publicOrder } = order;
  return returnData(publicOrder);
};
