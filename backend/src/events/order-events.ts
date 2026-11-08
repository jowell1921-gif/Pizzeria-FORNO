import { EventEmitter } from "node:events";

/**
 * Aviso de que un pedido ha cambiado. Solo lleva identificadores y el estado: nunca datos
 * personales, porque se envía a las pantallas de cocina y del personal (SSE).
 */
export interface OrderEvent {
  kind: "created" | "status";
  orderId: string;
  orderNumber: number;
  status: string;
}

/**
 * Bus de eventos en memoria. Vale mientras la API se ejecute en una sola instancia; con varias
 * réplicas habría que sustituirlo por un canal compartido (Redis, LISTEN/NOTIFY de PostgreSQL…).
 */
class OrderEventBus extends EventEmitter {
  publish(event: OrderEvent): void {
    this.emit("order", event);
  }

  subscribe(listener: (event: OrderEvent) => void): () => void {
    this.on("order", listener);
    return () => {
      this.off("order", listener);
    };
  }
}

export const orderEvents = new OrderEventBus();
orderEvents.setMaxListeners(200);
