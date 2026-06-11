import type { RowDataPacket } from "mysql2";
import { pool } from "../config/mysql.config";
import type { Product } from "../models/domain.types";

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
