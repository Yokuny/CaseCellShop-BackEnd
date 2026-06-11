import { z } from "./zod";

export const orderStatusEnum = z.enum(["pending", "processing", "confirmed", "failed"]);

export const orderItemSchema = z
  .object({
    productId: z.string().openapi({ example: "case-iphone-15" }),
    name: z.string().openapi({ example: "Capa Silicone iPhone 15" }),
    price: z.number().openapi({ example: 79.9 }),
    quantity: z.number().int().openapi({ example: 2 }),
  })
  .openapi("OrderItem");

export const orderSchema = z
  .object({
    id: z.string().openapi({ example: "9f1c0b3e-2a3d-4f5a-9b1c-0b3e2a3d4f5a" }),
    status: orderStatusEnum.openapi({ example: "confirmed" }),
    items: z.array(orderItemSchema),
    total: z.number().openapi({ example: 159.8 }),
    attempts: z.number().int().openapi({ example: 1 }),
    errorReason: z.string().nullable().openapi({ example: null }),
    createdAt: z.string().openapi({ example: "2026-06-10T12:00:00.000Z" }),
    updatedAt: z.string().openapi({ example: "2026-06-10T12:00:02.000Z" }),
  })
  .openapi("Order");

export const orderStatusResponseSchema = z
  .object({
    success: z.literal(true),
    data: orderSchema,
    message: z.string().openapi({ example: "" }),
  })
  .openapi("OrderStatusResponse");
