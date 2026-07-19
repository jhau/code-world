import { Order } from "./types";

export class OrderStore {
  private orders = new Map<string, Order>();

  async save(order: Order): Promise<Order> {
    this.orders.set(order.id, order);
    return order;
  }

  async findById(id: string): Promise<Order | null> {
    return this.orders.get(id) ?? null;
  }
}
