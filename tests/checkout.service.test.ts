import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomError } from "../src/models";

const orderRepo = vi.hoisted(() => ({
  findByIdempotencyKey: vi.fn(),
  create: vi.fn(),
}));
const productRepo = vi.hoisted(() => ({
  reserveStock: vi.fn(),
  releaseStock: vi.fn(),
}));
const messaging = vi.hoisted(() => ({ publishCheckoutRequested: vi.fn() }));

vi.mock("../src/repositories/order.repository", () => orderRepo);
vi.mock("../src/repositories/product.repository", () => productRepo);
vi.mock("../src/messaging", () => messaging);
vi.mock("../src/cache", () => ({ invalidateCatalog: vi.fn() }));
vi.mock("../src/metrics", () => ({ ordersTotal: { inc: vi.fn() }, stockReservations: { inc: vi.fn() } }));
vi.mock("../src/logger", () => ({ logger: { info: vi.fn() }, getContext: () => ({ correlationId: "test-corr" }), setOrderId: vi.fn() }));

import { createCheckout } from "../src/services/checkout.service";

const items = [{ productId: "case-iphone-15", quantity: 2 }];

describe("createCheckout", () => {
  beforeEach(() => vi.clearAllMocks());

  it("é idempotente: chave existente devolve o pedido sem reservar estoque de novo", async () => {
    orderRepo.findByIdempotencyKey.mockResolvedValue({ id: "order-1", status: "confirmed" });

    const res = await createCheckout({ items }, "key-123");

    expect(res).toEqual({ data: { orderId: "order-1", status: "confirmed" } });
    expect(productRepo.reserveStock).not.toHaveBeenCalled();
    expect(messaging.publishCheckoutRequested).not.toHaveBeenCalled();
  });

  it("propaga 409 quando não há estoque (anti-overselling)", async () => {
    orderRepo.findByIdempotencyKey.mockResolvedValue(null);
    productRepo.reserveStock.mockRejectedValue(new CustomError("Estoque insuficiente", 409));

    await expect(createCheckout({ items }, "key-456")).rejects.toMatchObject({ status: 409 });
    expect(orderRepo.create).not.toHaveBeenCalled();
  });

  it("happy path: reserva, persiste, publica no Kafka e retorna pending", async () => {
    orderRepo.findByIdempotencyKey.mockResolvedValue(null);
    productRepo.reserveStock.mockResolvedValue([{ productId: "case-iphone-15", name: "Capa", price: 79.9, quantity: 2 }]);
    orderRepo.create.mockResolvedValue(true);

    const res = await createCheckout({ items }, "key-789");

    expect(res.data).toMatchObject({ status: "pending" });
    expect(messaging.publishCheckoutRequested).toHaveBeenCalledTimes(1);
  });

  it("perde a corrida de idempotência: libera o estoque reservado", async () => {
    orderRepo.findByIdempotencyKey.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "winner", status: "pending" });
    productRepo.reserveStock.mockResolvedValue([{ productId: "case-iphone-15", name: "Capa", price: 79.9, quantity: 2 }]);
    orderRepo.create.mockResolvedValue(false); // chave duplicada (outro request venceu)

    const res = await createCheckout({ items }, "key-dup");

    expect(productRepo.releaseStock).toHaveBeenCalledTimes(1);
    expect(res.data).toMatchObject({ orderId: "winner" });
  });
});
