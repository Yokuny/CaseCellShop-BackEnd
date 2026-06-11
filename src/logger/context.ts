import { AsyncLocalStorage } from "node:async_hooks";

// Esse processo é como uma variavel global salvando o ID da requisição (correlationId)
const storage = new AsyncLocalStorage<LogContext>();

export const runWithContext = <T>(ctx: LogContext, fn: () => T): T => storage.run(ctx, fn);

export const getContext = (): LogContext | undefined => storage.getStore();

// Anexa o orderId ao contexto atual assim que ele é conhecido (após criar o pedido).
export const setOrderId = (orderId: string): void => {
  const ctx = storage.getStore();
  if (ctx) ctx.orderId = orderId;
};

export interface LogContext {
  correlationId: string;
  orderId?: string;
}
