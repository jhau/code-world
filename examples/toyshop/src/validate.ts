import { Order, ValidationError } from "./types";

export function validateOrder(order: Order): void {
  if (order.items.length === 0) {
    throw new ValidationError("items", "order must contain at least one item");
  }
  for (const item of order.items) {
    if (item.quantity <= 0) {
      throw new ValidationError("quantity", `invalid quantity for ${item.sku}`);
    }
    if (item.unitPrice < 0) {
      throw new ValidationError("unitPrice", `negative price for ${item.sku}`);
    }
  }
}
