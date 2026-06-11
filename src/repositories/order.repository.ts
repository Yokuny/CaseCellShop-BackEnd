import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../config/mysql.config";
import type { Order, OrderItem, OrderStatus } from "../models";

const toOrder = (row: RowDataPacket): Order => ({
  id: row.id,
  idempotencyKey: row.idempotency_key,
  status: row.status,
  // mysql2 já desserializa colunas JSON; em alguns drivers vem string.
  items: typeof row.items === "string" ? JSON.parse(row.items) : row.items,
  total: Number(row.total),
  attempts: row.attempts,
  errorReason: row.error_reason,
  createdAt: new Date(row.created_at).toISOString(),
  updatedAt: new Date(row.updated_at).toISOString(),
});

export interface NewOrder {
  id: string;
  idempotencyKey: string;
  items: OrderItem[];
  total: number;
}

// Insere o pedido em status "pending". Retorna false se a idempotency_key já
// existe (corrida de duplo clique), permitindo ao service buscar o pedido vigente.
export const create = async (order: NewOrder): Promise<boolean> => {
  try {
    await pool.query<ResultSetHeader>("INSERT INTO orders (id, idempotency_key, status, items, total, attempts) VALUES (:id, :key, 'pending', :items, :total, 0)", {
      id: order.id,
      key: order.idempotencyKey,
      items: JSON.stringify(order.items),
      total: order.total,
    });
    return true;
  } catch (e) {
    if ((e as { code?: string }).code === "ER_DUP_ENTRY") return false;
    throw e;
  }
};

export const findById = async (id: string): Promise<Order | null> => {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM orders WHERE id = :id", { id });
  return rows.length ? toOrder(rows[0]) : null;
};

export const findByIdempotencyKey = async (key: string): Promise<Order | null> => {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM orders WHERE idempotency_key = :key", { key });
  return rows.length ? toOrder(rows[0]) : null;
};

interface UpdateStatusOpts {
  incrementAttempts?: boolean;
  errorReason?: string | null;
}

export const updateStatus = async (id: string, status: OrderStatus, opts: UpdateStatusOpts = {}): Promise<void> => {
  await pool.query<ResultSetHeader>(
    `UPDATE orders
        SET status = :status,
            attempts = attempts + :inc,
            error_reason = :reason
      WHERE id = :id`,
    { id, status, inc: opts.incrementAttempts ? 1 : 0, reason: opts.errorReason ?? null },
  );
};
