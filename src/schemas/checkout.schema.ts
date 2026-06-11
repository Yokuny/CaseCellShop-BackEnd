import { z } from "./zod";

export const checkoutItemSchema = z
  .object({
    productId: z.string().min(1, "productId é obrigatório").openapi({ example: "case-iphone-15" }),
    quantity: z.number().int().positive("quantity deve ser um inteiro positivo").openapi({ example: 2 }),
  })
  .openapi("CheckoutItem");

export const checkoutSchema = z
  .object({
    items: z.array(checkoutItemSchema).min(1, "O checkout precisa de ao menos um item"),
  })
  .openapi("CheckoutRequest");

export const checkoutResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.object({
      orderId: z.string().openapi({ example: "9f1c0b3e-2a3d-4f5a-9b1c-0b3e2a3d4f5a" }),
      status: z.enum(["pending", "processing", "confirmed", "failed"]).openapi({ example: "pending" }),
    }),
    message: z.string().openapi({ example: "Checkout aceito e em processamento" }),
  })
  .openapi("CheckoutResponse");

export type CheckoutItem = z.infer<typeof checkoutItemSchema>;
export type Checkout = z.infer<typeof checkoutSchema>;
