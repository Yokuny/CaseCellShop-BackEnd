import { z } from "./zod";

export const productSchema = z
  .object({
    id: z.string().openapi({ example: "case-iphone-15" }),
    name: z.string().openapi({ example: "Capa Silicone iPhone 15" }),
    description: z.string().openapi({ example: "Capa de silicone com toque aveludado" }),
    price: z.number().openapi({ example: 79.9 }),
    stock: z.number().int().openapi({ example: 120 }),
    category: z.string().openapi({ example: "capa" }),
    updatedAt: z.string().openapi({ example: "2026-06-10T12:00:00.000Z" }),
  })
  .openapi("Product");

export const productsResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.array(productSchema),
    message: z.string().openapi({ example: "" }),
  })
  .openapi("ProductsResponse");

export type ProductDTO = z.infer<typeof productSchema>;
