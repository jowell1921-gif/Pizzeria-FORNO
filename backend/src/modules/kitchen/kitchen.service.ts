import { z } from "zod";

import type { PrismaClient } from "../../db/client.js";
import type { OrderStatus } from "../../generated/prisma/enums.js";
import { forbidden, notFound } from "../../errors.js";
import { changeOrderStatus } from "../orders/status.service.js";

/** Los pedidos completados siguen visibles en la pantalla de cocina durante este tiempo. */
const COMPLETED_VISIBLE_MS = 3 * 60 * 60 * 1000;

/**
 * Cambios que puede hacer la cocina. Aceptar, preparar, marcar listo y entregar al cliente en el
 * local. Rechazar, cancelar o devolver un pedido, o sacarlo a reparto, es cosa del personal.
 */
const KITCHEN_TRANSITIONS: Record<string, readonly OrderStatus[]> = {
  NEW: ["ACCEPTED"],
  ACCEPTED: ["PREPARING"],
  PREPARING: ["READY"],
  READY: ["COMPLETED"],
};

export const kitchenStatusSchema = z
  .object({ status: z.enum(["ACCEPTED", "PREPARING", "READY", "COMPLETED"]) })
  .strict();

const include = {
  items: { include: { options: true }, orderBy: { productName: "asc" as const } },
};

type KitchenRow = {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  type: "PICKUP" | "DELIVERY";
  placedAt: Date;
  scheduledFor: Date | null;
  estimatedReadyAt: Date | null;
  notes: string | null;
  items: Array<{
    quantity: number;
    productName: string;
    notes: string | null;
    options: Array<{ optionName: string }>;
  }>;
};

/**
 * Lo único que ve la cocina de un pedido: qué preparar y para cuándo. No incluye datos del cliente
 * (nombre, teléfono, correo, dirección), importes ni pagos.
 */
function kitchenView(order: KitchenRow) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    type: order.type,
    placedAt: order.placedAt.toISOString(),
    scheduledFor: order.scheduledFor?.toISOString() ?? null,
    estimatedReadyAt: order.estimatedReadyAt?.toISOString() ?? null,
    notes: order.notes,
    items: order.items.map((item) => ({
      quantity: item.quantity,
      name: item.productName,
      options: item.options.map((option) => option.optionName),
      notes: item.notes,
    })),
  };
}

/** Pedidos en curso y los completados hace poco, del más urgente al menos. */
export async function listKitchenOrders(prisma: PrismaClient, now = new Date()) {
  const rows = await prisma.order.findMany({
    where: {
      OR: [
        { status: { in: ["NEW", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY"] } },
        {
          status: "COMPLETED",
          completedAt: { gte: new Date(now.getTime() - COMPLETED_VISIBLE_MS) },
        },
      ],
    },
    include,
    orderBy: [{ scheduledFor: { sort: "asc", nulls: "last" } }, { placedAt: "asc" }],
  });
  return rows.map(kitchenView);
}

export async function changeKitchenStatus(
  prisma: PrismaClient,
  actorId: string,
  orderId: string,
  body: unknown,
) {
  const { status } = kitchenStatusSchema.parse(body);
  if (!z.uuid().safeParse(orderId).success) throw notFound("Order not found");
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, type: true },
  });
  if (!order) throw notFound("Order not found");

  const allowed = KITCHEN_TRANSITIONS[order.status] ?? [];
  // La cocina solo entrega pedidos para recoger; los de reparto los cierra el personal.
  const deliveryBlocked = status === "COMPLETED" && order.type === "DELIVERY";
  if (!allowed.includes(status) || deliveryBlocked) {
    throw forbidden("KITCHEN_TRANSITION_NOT_ALLOWED", "The kitchen cannot make this change");
  }
  await changeOrderStatus(prisma, { orderId, to: status, actorId });

  const updated = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include });
  return kitchenView(updated);
}
