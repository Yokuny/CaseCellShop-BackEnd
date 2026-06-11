export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  updatedAt: string;
}

export type OrderStatus = "pending" | "processing" | "confirmed" | "failed";

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: string;
  idempotencyKey: string;
  status: OrderStatus;
  items: OrderItem[];
  total: number;
  attempts: number;
  errorReason: string | null;
  createdAt: string;
  updatedAt: string;
}

// Mensagem publicada no tópico checkout.requested.
export interface CheckoutRequestedEvent {
  orderId: string;
  correlationId: string;
}
