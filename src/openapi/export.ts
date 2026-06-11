import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildOpenApiDocument } from "./document";

// Exporta o contrato para um arquivo openapi.json na raiz (útil para CI/clientes).
const document = buildOpenApiDocument();
const target = resolve(process.cwd(), "openapi.json");
writeFileSync(target, JSON.stringify(document, null, 2));
console.log(`OpenAPI gerado em ${target}`);
