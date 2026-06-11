import express, { type Application, type Request, type Response } from "express";
import client from "prom-client";

const register = client.register;
client.collectDefaultMetrics({ register });

// --- HTTP ---
export const reqResTime = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duração das requisições HTTP em segundos",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.05, 0.25, 0.5, 1, 2.5, 5, 10],
});

// --- Cache (vitrine) ---
export const cacheOps = new client.Counter({
  name: "cache_operations_total",
  help: "Operações de cache por resultado (hit/miss/stale/error)",
  labelNames: ["cache", "result"],
});

// --- Estoque / concorrência ---
export const stockReservations = new client.Counter({
  name: "stock_reservation_total",
  help: "Tentativas de reserva de estoque por resultado",
  labelNames: ["result"], // reserved | insufficient | released
});

// --- Checkout / pedidos ---
export const ordersTotal = new client.Counter({
  name: "checkout_orders_total",
  help: "Pedidos por status final/transição",
  labelNames: ["status"], // accepted | confirmed | failed | idempotent_hit
});

export const checkoutProcessing = new client.Histogram({
  name: "checkout_processing_duration_seconds",
  help: "Duração do processamento assíncrono de um checkout",
  labelNames: ["result"],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
});

// --- Kafka (fila/worker) ---
export const kafkaMessages = new client.Counter({
  name: "kafka_messages_total",
  help: "Mensagens Kafka por tópico e resultado",
  labelNames: ["topic", "result"], // produced | consumed | retried | dead_letter
});

// --- ERP simulado ---
export const erpBilling = new client.Histogram({
  name: "erp_billing_duration_seconds",
  help: "Duração da chamada simulada de faturamento ao ERP",
  labelNames: ["result"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

const app: Application = express();

app.get("/metrics", async (_req: Request, res: Response) => {
  res.set("Content-Type", register.contentType);
  res.send(await register.metrics());
});

export default app;
