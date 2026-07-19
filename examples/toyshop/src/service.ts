import { Order } from "./types";
import { validateOrder } from "./validate";
import { OrderStore } from "./db";

export async function placeOrder(
  raw: Omit<Order, "total" | "placedAt">,
  store: OrderStore
): Promise<Order> {
  let total = 0;
  for (const item of raw.items) {
    total += item.quantity * item.unitPrice;
  }

  const order: Order = { ...raw, total, placedAt: new Date() };
  validateOrder(order);
  return store.save(order);
}
