import { z } from "zod";

import type { PrismaClient } from "../../db/client.js";
import { HttpError } from "../../errors.js";
import { cartLineSchema, MAX_CART_LINES } from "../checkout/pricing.js";

/** El carrito guardado puede estar vacío; el esquema de pedido, en cambio, exige al menos una línea. */
export const replaceCartSchema = z
  .object({ items: z.array(cartLineSchema).max(MAX_CART_LINES) })
  .strict();

function view(
  items: Array<{
    productId: string;
    quantity: number;
    notes: string | null;
    options: Array<{ optionId: string }>;
  }>,
) {
  return {
    items: items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      optionIds: item.options.map((option) => option.optionId).sort(),
      notes: item.notes,
    })),
  };
}

const include = { items: { orderBy: { id: "asc" as const }, include: { options: true } } };

/** Carrito guardado en el servidor del usuario (sincroniza la web y la app). */
export async function getCart(prisma: PrismaClient, userId: string) {
  const cart = await prisma.cart.findUnique({ where: { userId }, include });
  return view(cart?.items ?? []);
}

/**
 * Sustituye el contenido del carrito. Guarda solo qué se quiere (producto, opciones, cantidad): los
 * precios no se guardan, se calculan al hacer el presupuesto o el pedido. Los productos y opciones
 * que ya no existan se descartan.
 */
export async function replaceCart(prisma: PrismaClient, userId: string, body: unknown) {
  const { items } = replaceCartSchema.parse(body);

  const productIds = [...new Set(items.map((item) => item.productId))];
  const optionIds = [...new Set(items.flatMap((item) => item.optionIds))];
  const [products, options] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds }, deletedAt: null },
      select: { id: true },
    }),
    prisma.productOption.findMany({
      where: { id: { in: optionIds }, deletedAt: null, group: { product: { deletedAt: null } } },
      select: { id: true, group: { select: { productId: true } } },
    }),
  ]);
  const knownProducts = new Set(products.map((product) => product.id));
  const optionProduct = new Map(options.map((option) => [option.id, option.group.productId]));

  const kept = items
    .filter((item) => knownProducts.has(item.productId))
    .map((item) => ({
      ...item,
      optionIds: item.optionIds.filter((id) => optionProduct.get(id) === item.productId),
    }));

  try {
    await prisma.$transaction(async (tx) => {
      const cart = await tx.cart.upsert({ where: { userId }, update: {}, create: { userId } });
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      for (const item of kept) {
        await tx.cartItem.create({
          data: {
            cartId: cart.id,
            productId: item.productId,
            quantity: item.quantity,
            notes: item.notes ?? null,
            options: { create: item.optionIds.map((optionId) => ({ optionId })) },
          },
        });
      }
    });
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "P2002") {
      throw new HttpError(
        409,
        "CART_CONFLICT",
        "The cart was modified at the same time, try again",
      );
    }
    throw error;
  }
  return getCart(prisma, userId);
}

/** Vacía el carrito guardado del usuario (se llama al crear un pedido). */
export async function clearCart(prisma: Pick<PrismaClient, "cartItem">, userId: string) {
  await prisma.cartItem.deleteMany({ where: { cart: { userId } } });
}
