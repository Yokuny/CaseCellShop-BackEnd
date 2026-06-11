import { z } from "./zod";

export const errorResponseSchema = z
  .object({
    success: z.literal(false),
    message: z.string().openapi({ example: "Produto 'case-x' não encontrado" }),
    correlationId: z.string().optional().openapi({ example: "9f1c0b3e-2a3d-4f5a-9b1c-0b3e2a3d4f5a" }),
  })
  .openapi("ErrorResponse");
