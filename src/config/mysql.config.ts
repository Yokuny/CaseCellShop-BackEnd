import mysql, { type Pool } from "mysql2/promise";
import { logger } from "../logger";
import { env } from "./env.config";

// Pool único compartilhado. mysql2/promise faz o gerenciamento de conexões;
// apenas repositories acessam este pool.
export const pool: Pool = mysql.createPool({
  host: env.MYSQL_HOST,
  port: env.MYSQL_PORT,
  user: env.MYSQL_USER,
  password: env.MYSQL_PASSWORD,
  database: env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
});

export const mysqlConnect = async (): Promise<void> => {
  // Retry simples: o MySQL pode demorar a aceitar conexões logo após subir.
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const conn = await pool.getConnection();
      await conn.ping();
      conn.release();
      logger.info({ host: env.MYSQL_HOST, port: env.MYSQL_PORT, db: env.MYSQL_DATABASE }, "[MYSQL] conectado");
      return;
    } catch (e) {
      logger.warn({ attempt, maxAttempts, err: (e as Error).message }, "[MYSQL] aguardando o banco...");
      if (attempt === maxAttempts) throw e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
};

export const mysqlDisconnect = async (): Promise<void> => {
  await pool.end();
};
