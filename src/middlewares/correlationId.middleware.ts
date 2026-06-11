import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { runWithContext } from "../logger";

// Cria um ID unico para a requisição / Também aceita um ID vindo do cliente (ex: gateway) para continuar o rastreamento.
// O id retorna no header da resposta.
export const correlationId = (req: Request, res: Response, next: NextFunction): void => {
  const id = req.header("x-correlation-id") || req.header("x-request-id") || randomUUID();
  res.setHeader("x-correlation-id", id);
  // É salvo no contexto global
  runWithContext({ correlationId: id }, () => next());
};
