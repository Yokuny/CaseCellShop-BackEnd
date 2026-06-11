import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../config/mysql.config";
import { CustomError, type OrderItem, type Product } from "../models";
import type { CheckoutItem } from "../schemas";

const toProduct = (row: RowDataPacket): Product => ({
  id: row.id,
  name: row.name,
  description: row.description,
  price: Number(row.price),
  stock: row.stock,
  category: row.category,
  updatedAt: new Date(row.updated_at).toISOString(),
});

export const findAll = async (): Promise<Product[]> => {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT id, name, description, price, stock, category, updated_at FROM products ORDER BY name");
  return rows.map(toProduct);
};

export const findById = async (id: string): Promise<Product | null> => {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT id, name, description, price, stock, category, updated_at FROM products WHERE id = :id", { id });
  return rows.length ? toProduct(rows[0]) : null;
};

// Roda tudo numa transação: se um item falha, faz rollback dos anteriores.
export const reserveStock = async (items: CheckoutItem[]): Promise<OrderItem[]> => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const reserved: OrderItem[] = [];

    for (const item of items) {
      const [rows] = await conn.query<RowDataPacket[]>("SELECT id, name, price FROM products WHERE id = :id", { id: item.productId });
      if (!rows.length) throw new CustomError(`Produto '${item.productId}' não encontrado`, 404);

      const [res] = await conn.query<ResultSetHeader>("UPDATE products SET stock = stock - :q WHERE id = :id AND stock >= :q", { q: item.quantity, id: item.productId });
      if (res.affectedRows === 0) throw new CustomError(`Estoque insuficiente para '${rows[0].name}'`, 409);

      reserved.push({ productId: rows[0].id, name: rows[0].name, price: Number(rows[0].price), quantity: item.quantity });
    }

    await conn.commit();
    return reserved;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

// Devolve o estoque reservado — usado na reconciliação quando o pedido falha.
export const releaseStock = async (items: OrderItem[]): Promise<void> => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const item of items) {
      await conn.query("UPDATE products SET stock = stock + :q WHERE id = :id", { q: item.quantity, id: item.productId });
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};
