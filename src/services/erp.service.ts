import { env } from "../config";
import { erpBilling } from "../metrics";
import type { Order } from "../models";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Simula a chamada síncrona e lenta ao ERP para faturar o pedido.
 * - Latência artificial para representar o ERP "demorando para faturar".
 * - Falha transitória controlada por ERP_FAILURE_RATE (0 por padrão → sucesso
 *   determinístico). Suba o valor (ex.: 0.5) para exercitar retry/reconciliação.
 */
export const billOnErp = async (_order: Order): Promise<void> => {
  const stop = erpBilling.startTimer();
  await sleep(800);

  if (Math.random() < env.ERP_FAILURE_RATE) {
    stop({ result: "error" });
    throw new Error("ERP indisponível / timeout ao faturar o pedido");
  }

  stop({ result: "success" });
};
