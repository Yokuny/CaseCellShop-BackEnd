import { z } from "./zod";

export const orderIdParamSchema = z.object({
  orderId: z.string().min(1, "orderId é obrigatório"),
});

export const productIdParamSchema = z.object({
  id: z.string().min(1, "id é obrigatório"),
});
