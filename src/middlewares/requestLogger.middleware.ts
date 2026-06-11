import type { NextFunction, Request, Response } from "express";
import { logger } from "../logger";

// Loga a conclusão de cada requisição com método, rota, status e duração.
// O correlationId/orderId entram automaticamente via mixin do logger.
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
    logger.info(
      {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs,
      },
      "http_request",
    );
  });
  next();
};
