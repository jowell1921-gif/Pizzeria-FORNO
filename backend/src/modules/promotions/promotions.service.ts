import type { Prisma, PrismaClient } from "../../db/client.js";

const money = (value: Prisma.Decimal | null) => (value ? value.toFixed(2) : null);

/**
 * Promociones públicas: activas, sin borrar y dentro de su fecha de validez. Solo se muestran los
 * cupones que no son personales. Que una promoción o un cupón sea aplicable a un pedido concreto
 * (límites de uso, primer pedido, importe mínimo…) lo decide el servidor al crear el pedido.
 */
export async function listPromotions(prisma: PrismaClient, now = new Date()) {
  const rows = await prisma.promotion.findMany({
    where: {
      active: true,
      deletedAt: null,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: { createdAt: "asc" },
    include: {
      products: { include: { product: { select: { id: true, name: true } } } },
      coupons: {
        where: {
          userId: null,
          active: true,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  return rows.map((promotion) => ({
    id: promotion.id,
    name: promotion.name,
    description: promotion.description,
    badge: promotion.badge,
    kind: promotion.kind,
    discountType: promotion.discountType,
    discountValue: money(promotion.discountValue),
    comboPrice: money(promotion.comboPrice),
    minSubtotal: money(promotion.minSubtotal),
    firstOrderOnly: promotion.firstOrderOnly,
    startsAt: promotion.startsAt?.toISOString() ?? null,
    endsAt: promotion.endsAt?.toISOString() ?? null,
    conditions: promotion.conditions,
    code: promotion.coupons[0]?.code ?? null,
    products: promotion.products.map((row) => ({
      id: row.product.id,
      name: row.product.name,
      quantity: row.quantity,
    })),
  }));
}
