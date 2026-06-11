import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Habilita `.openapi()` nos schemas Zod. Precisa rodar antes de qualquer schema
// usar o método — por isso todos os schemas importam `z` deste módulo.
extendZodWithOpenApi(z);

export { z };
