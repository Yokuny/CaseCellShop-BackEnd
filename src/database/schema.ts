import type { RowDataPacket } from "mysql2";
import { pool } from "../config/mysql.config";
import { logger } from "../logger";

// DDL idempotente. Rodamos no startup para que o projeto funcione tanto via
// Docker Compose quanto local (pnpm dev) sem passos manuais de migração.
const PRODUCTS_DDL = `
  CREATE TABLE IF NOT EXISTS products (
    id          VARCHAR(64)  PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    description TEXT         NOT NULL,
    price       DECIMAL(10,2) NOT NULL,
    stock       INT          NOT NULL,
    category    VARCHAR(64)  NOT NULL,
    updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

// idempotency_key UNIQUE garante idempotência de checkout (retry/duplo clique).
const ORDERS_DDL = `
  CREATE TABLE IF NOT EXISTS orders (
    id              VARCHAR(36)  PRIMARY KEY,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    status          ENUM('pending','processing','confirmed','failed') NOT NULL DEFAULT 'pending',
    items           JSON         NOT NULL,
    total           DECIMAL(10,2) NOT NULL,
    attempts        INT          NOT NULL DEFAULT 0,
    error_reason    VARCHAR(512) NULL,
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

const SEED_PRODUCTS: Array<[string, string, string, number, number, string]> = [
  ["case-iphone-15", "Capa Silicone iPhone 15", "Capa de silicone com toque aveludado", 79.9, 120, "capa"],
  ["case-galaxy-s24", "Capa Anti-impacto Galaxy S24", "Capa rígida com proteção militar", 99.9, 80, "capa"],
  ["film-iphone-15", "Película 3D iPhone 15", "Película de vidro temperado borda a borda", 39.9, 300, "pelicula"],
  ["film-galaxy-s24", "Película Privacidade Galaxy S24", "Película com filtro de privacidade", 49.9, 150, "pelicula"],
  ["charger-20w", "Carregador Turbo 20W USB-C", "Carregamento rápido com Power Delivery", 89.9, 200, "carregador"],
  ["charger-wireless", "Carregador Wireless 15W", "Base de carregamento por indução", 129.9, 60, "carregador"],
  ["earbuds-pro", "Fone Bluetooth Pro ANC", "Fone in-ear com cancelamento de ruído", 249.9, 45, "fone"],
  ["cable-usbc", "Cabo USB-C Trançado 2m", "Cabo reforçado com carga rápida", 34.9, 500, "acessorio"],
];

export const ensureSchema = async (): Promise<void> => {
  await pool.query(PRODUCTS_DDL);
  await pool.query(ORDERS_DDL);

  const [rows] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM products");
  if (rows[0].total === 0) {
    await pool.query("INSERT INTO products (id, name, description, price, stock, category) VALUES ?", [SEED_PRODUCTS]);
    logger.info({ count: SEED_PRODUCTS.length }, "[DB] catálogo populado (seed)");
  }

  logger.info("[DB] schema garantido");
};
