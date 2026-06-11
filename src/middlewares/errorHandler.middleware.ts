import type { NextFunction, Request, Response } from "express";
import { getContext, logger } from "../logger";
import { CustomError } from "../models";

// biome-ignore lint/suspicious/noExplicitAny: handler de erro do Express recebe qualquer valor lançado
export const errorHandler = (e: any, _req: Request, res: Response, _next: NextFunction): void => {
  const correlationId = getContext()?.correlationId;
  const status = e instanceof CustomError ? e.status : 500;
  const message = e?.message || "Erro interno";

  if (status >= 500) {
    logger.error({ err: message, stack: e?.stack }, "unhandled_error");
  } else {
    logger.warn({ err: message, status }, "request_error");
  }

  res.status(status).send({ success: false, message, correlationId });
};
