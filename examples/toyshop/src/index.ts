import { createServer } from "node:http";
import { ValidationError } from "./types";
import { OrderStore } from "./db";
import { placeOrder } from "./service";

const store = new OrderStore();

createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const order = await placeOrder(JSON.parse(body), store);
      res.writeHead(201).end(JSON.stringify(order));
    } catch (err) {
      if (err instanceof ValidationError) {
        res.writeHead(400).end(JSON.stringify({ field: err.field, error: err.message }));
      } else {
        res.writeHead(500).end();
      }
    }
  });
}).listen(3000);
