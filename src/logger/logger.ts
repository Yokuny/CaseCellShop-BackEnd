import pino from "pino";
import { env } from "../config/env.config";
import { getContext } from "./context";

// Logger estruturado (JSON). O `mixin` injeta automaticamente correlationId e
// orderId do contexto corrente em toda linha de log, sem precisar passá-los à mão.
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "casecellshop-backend" },
  formatters: {
    level: (label) => ({ level: label }),
  },
  mixin() {
    const ctx = getContext();
    if (!ctx) return {};
    return ctx.orderId ? { correlationId: ctx.correlationId, orderId: ctx.orderId } : { correlationId: ctx.correlationId };
  },
});
