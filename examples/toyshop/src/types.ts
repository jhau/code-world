export interface OrderItem {
  sku: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  items: OrderItem[];
  total: number;
  placedAt: Date;
}

export class ValidationError extends Error {
  constructor(public field: string, message: string) {
    super(message);
  }
}
