import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { respObj } from "../helpers";
import * as service from "../services/checkout.service";

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Idempotency-Key do cliente tolera retry/duplo clique. Sem ela, cada
    // requisição é um pedido novo (chave aleatória).
    const idempotencyKey = req.header("idempotency-key") || randomUUID();
    const resp = await service.createCheckout(req.body, idempotencyKey);
    res.status(202).json(respObj(resp));
  } catch (e) {
    next(e);
  }
};
