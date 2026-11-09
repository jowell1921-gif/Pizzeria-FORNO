import { z } from "zod";

import type { Prisma, PrismaClient } from "../../db/client.js";
import { conflict, HttpError, notFound } from "../../errors.js";
import { recordAudit } from "../../utils/audit.js";

const money = (value: Prisma.Decimal | null) => (value ? value.toFixed(2) : null);
const uuid = z.uuid();
const amount = z.string().regex(/^\d{1,6}(\.\d{1,2})?$/, "Invalid amount");
const date = z.iso.datetime();

const promotionFields = {
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(1).max(300),
  badge: z.string().trim().max(30).nullable().optional(),
  kind: z.enum(["DISCOUNT", "COMBO"]),
  discountType: z.enum(["PERCENT", "FIXED"]).nullable().optional(),
  discountValue: amount.nullable().optional(),
  /** Precio cerrado de un combo. */
  comboPrice: amount.nullable().optional(),
  /** Productos (y cantidades) del combo o a los que se limita el descuento. */
  products: z
    .array(
      z.object({ productId: uuid, quantity: z.number().int().min(1).max(20).default(1) }).strict(),
    )
    .max(20)
    .optional(),
  minSubtotal: amount.nullable().optional(),
  startsAt: date.nullable().optional(),
  endsAt: date.nullable().optional(),
  maxRedemptions: z.number().int().min(1).nullable().optional(),
  perUserLimit: z.number().int().min(1).nullable().optional(),
  firstOrderOnly: z.boolean().optional(),
  /** Se aplica sola, sin código, al cumplir las condiciones. */
  automatic: z.boolean().optional(),
  active: z.boolean().optional(),
  conditions: z.array(z.string().trim().min(1).max(160)).max(10).optional(),
};

export const promotionSchema = z
  .object(promotionFields)
  .strict()
  .superRefine((value, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (value.kind === "DISCOUNT") {
      if (!value.discountType || !value.discountValue || Number(value.discountValue) <= 0) {
        issue("discountValue", "A discount needs a type and a value greater than zero");
      } else if (value.discountType === "PERCENT" && Number(value.discountValue) > 100) {
        issue("discountValue", "A percentage cannot exceed 100");
      }
    } else {
      if (value.comboPrice == null) issue("comboPrice", "A combo needs a closed price");
      if ((value.products ?? []).length === 0) issue("products", "A combo needs its products");
    }
    if (value.startsAt && value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
      issue("endsAt", "The end must be after the start");
    }
  });

export type PromotionInput = z.infer<typeof promotionSchema>;

/** Para editar: partial estricto; luego se valida la promoción completa resultante. */
export const promotionPatchSchema = z
  .object(promotionFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

const couponFields = {
  code: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9_-]{3,32}$/, "Invalid code")),
  /** Cupón personal de un cliente. */
  userId: uuid.nullable().optional(),
  maxRedemptions: z.number().int().min(1).nullable().optional(),
  perUserLimit: z.number().int().min(1).nullable().optional(),
  startsAt: date.nullable().optional(),
  endsAt: date.nullable().optional(),
  active: z.boolean().default(true),
};

export const couponSchema = z
  .object(couponFields)
  .strict()
  .refine(
    (value) =>
      !(value.startsAt && value.endsAt) || Date.parse(value.endsAt) > Date.parse(value.startsAt),
    "The end must be after the start",
  );
/** El código de un cupón no se cambia: se crea otro. */
export const couponPatchSchema = z
  .object({
    userId: couponFields.userId,
    maxRedemptions: couponFields.maxRedemptions,
    perUserLimit: couponFields.perUserLimit,
    startsAt: couponFields.startsAt,
    endsAt: couponFields.endsAt,
    active: z.boolean(),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

const include = {
  products: { include: { product: { select: { name: true } } } },
  coupons: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.PromotionInclude;

type PromotionRow = Prisma.PromotionGetPayload<{ include: typeof include }>;

const ACTIVE_ORDER = { notIn: ["CANCELLED", "REJECTED"] as ("CANCELLED" | "REJECTED")[] };

async function view(
  prisma: Pick<PrismaClient, "orderDiscount" | "couponRedemption">,
  row: PromotionRow,
) {
  const usage = await prisma.orderDiscount.count({
    where: { promotionId: row.id, order: { status: ACTIVE_ORDER } },
  });
  const coupons = await Promise.all(
    row.coupons.map(async (coupon) => ({
      id: coupon.id,
      code: coupon.code,
      userId: coupon.userId,
      maxRedemptions: coupon.maxRedemptions,
      perUserLimit: coupon.perUserLimit,
      startsAt: coupon.startsAt?.toISOString() ?? null,
      endsAt: coupon.endsAt?.toISOString() ?? null,
      active: coupon.active,
      usage: await prisma.couponRedemption.count({
        where: { couponId: coupon.id, order: { status: ACTIVE_ORDER } },
      }),
    })),
  );
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    badge: row.badge,
    kind: row.kind,
    discountType: row.discountType,
    discountValue: money(row.discountValue),
    comboPrice: money(row.comboPrice),
    products: row.products.map((item) => ({
      productId: item.productId,
      productName: item.product.name,
      quantity: item.quantity,
    })),
    minSubtotal: money(row.minSubtotal),
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    maxRedemptions: row.maxRedemptions,
    perUserLimit: row.perUserLimit,
    firstOrderOnly: row.firstOrderOnly,
    automatic: row.automatic,
    active: row.active,
    conditions: row.conditions,
    usage,
    coupons,
  };
}

export async function listAdminPromotions(prisma: PrismaClient) {
  const rows = await prisma.promotion.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    include,
  });
  return Promise.all(rows.map((row) => view(prisma, row)));
}

export async function getAdminPromotion(prisma: PrismaClient, id: string) {
  if (!uuid.safeParse(id).success) throw notFound("Promotion not found");
  const row = await prisma.promotion.findFirst({ where: { id, deletedAt: null }, include });
  if (!row) throw notFound("Promotion not found");
  return view(prisma, row);
}

const data = (input: PromotionInput) => ({
  name: input.name,
  description: input.description,
  badge: input.badge ?? null,
  kind: input.kind,
  discountType: input.kind === "DISCOUNT" ? (input.discountType ?? null) : null,
  discountValue: input.kind === "DISCOUNT" ? (input.discountValue ?? null) : null,
  comboPrice: input.kind === "COMBO" ? (input.comboPrice ?? null) : null,
  minSubtotal: input.minSubtotal ?? null,
  startsAt: input.startsAt ? new Date(input.startsAt) : null,
  endsAt: input.endsAt ? new Date(input.endsAt) : null,
  maxRedemptions: input.maxRedemptions ?? null,
  perUserLimit: input.perUserLimit ?? null,
  firstOrderOnly: input.firstOrderOnly ?? false,
  automatic: input.automatic ?? false,
  active: input.active ?? true,
  conditions: input.conditions ?? [],
});

async function writeProducts(
  tx: Prisma.TransactionClient,
  promotionId: string,
  products: NonNullable<PromotionInput["products"]>,
) {
  const unique = new Map(products.map((item) => [item.productId, item.quantity]));
  const found = await tx.product.count({
    where: { id: { in: [...unique.keys()] }, deletedAt: null },
  });
  if (found !== unique.size) {
    throw new HttpError(422, "PRODUCT_NOT_FOUND", "A product of the promotion does not exist");
  }
  await tx.promotionProduct.deleteMany({ where: { promotionId } });
  for (const [productId, quantity] of unique) {
    await tx.promotionProduct.create({ data: { promotionId, productId, quantity } });
  }
}

const summary = (row: { name: string; kind: string; active: boolean; automatic: boolean }) => ({
  name: row.name,
  kind: row.kind,
  active: row.active,
  automatic: row.automatic,
});

export async function createPromotion(prisma: PrismaClient, actorId: string, body: unknown) {
  const input = promotionSchema.parse(body);
  const id = await prisma.$transaction(async (tx) => {
    const created = await tx.promotion.create({ data: data(input) });
    await writeProducts(tx, created.id, input.products ?? []);
    await recordAudit(tx, {
      actorId,
      action: "promotion.create",
      entityType: "Promotion",
      entityId: created.id,
      after: summary(created),
    });
    return created.id;
  });
  return getAdminPromotion(prisma, id);
}

export async function updatePromotion(
  prisma: PrismaClient,
  actorId: string,
  id: string,
  body: unknown,
) {
  const patch = promotionPatchSchema.parse(body);
  if (!uuid.safeParse(id).success) throw notFound("Promotion not found");
  await prisma.$transaction(async (tx) => {
    const before = await tx.promotion.findFirst({ where: { id, deletedAt: null }, include });
    if (!before) throw notFound("Promotion not found");
    // Se mezcla con lo existente y se valida la promoción completa (las reglas cruzan campos).
    const merged = promotionSchema.parse({
      name: before.name,
      description: before.description,
      badge: before.badge,
      kind: before.kind,
      discountType: before.discountType,
      discountValue: money(before.discountValue),
      comboPrice: money(before.comboPrice),
      products: before.products.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
      minSubtotal: money(before.minSubtotal),
      startsAt: before.startsAt?.toISOString() ?? null,
      endsAt: before.endsAt?.toISOString() ?? null,
      maxRedemptions: before.maxRedemptions,
      perUserLimit: before.perUserLimit,
      firstOrderOnly: before.firstOrderOnly,
      automatic: before.automatic,
      active: before.active,
      conditions: before.conditions,
      ...patch,
    });
    const after = await tx.promotion.update({ where: { id }, data: data(merged) });
    if (patch.products !== undefined) await writeProducts(tx, id, merged.products ?? []);
    await recordAudit(tx, {
      actorId,
      action: "promotion.update",
      entityType: "Promotion",
      entityId: id,
      before: summary(before),
      after: { ...summary(after), changed: Object.keys(patch) },
    });
  });
  return getAdminPromotion(prisma, id);
}

/** Borrado lógico: deja de mostrarse y de aplicarse; los pedidos que la usaron la conservan. */
export async function deletePromotion(prisma: PrismaClient, actorId: string, id: string) {
  if (!uuid.safeParse(id).success) throw notFound("Promotion not found");
  await prisma.$transaction(async (tx) => {
    const row = await tx.promotion.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw notFound("Promotion not found");
    await tx.promotion.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await tx.coupon.updateMany({ where: { promotionId: id }, data: { active: false } });
    await recordAudit(tx, {
      actorId,
      action: "promotion.delete",
      entityType: "Promotion",
      entityId: id,
      before: summary(row),
    });
  });
}

// ───────────────────────────── Cupones ─────────────────────────────

export async function createCoupon(
  prisma: PrismaClient,
  actorId: string,
  promotionId: string,
  body: unknown,
) {
  const input = couponSchema.parse(body);
  if (!uuid.safeParse(promotionId).success) throw notFound("Promotion not found");
  await prisma.$transaction(async (tx) => {
    const promotion = await tx.promotion.findFirst({ where: { id: promotionId, deletedAt: null } });
    if (!promotion) throw notFound("Promotion not found");
    if (await tx.coupon.findUnique({ where: { code: input.code } })) {
      throw conflict("COUPON_CODE_EXISTS", "A coupon with this code already exists");
    }
    if (input.userId && !(await tx.profile.findUnique({ where: { id: input.userId } }))) {
      throw new HttpError(422, "CUSTOMER_NOT_FOUND", "The customer does not exist");
    }
    const coupon = await tx.coupon.create({
      data: {
        code: input.code,
        promotionId,
        userId: input.userId ?? null,
        maxRedemptions: input.maxRedemptions ?? null,
        perUserLimit: input.perUserLimit ?? null,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        active: input.active,
      },
    });
    await recordAudit(tx, {
      actorId,
      action: "coupon.create",
      entityType: "Coupon",
      entityId: coupon.id,
      after: { code: coupon.code, promotionId, personal: coupon.userId !== null },
    });
  });
  return getAdminPromotion(prisma, promotionId);
}

export async function updateCoupon(
  prisma: PrismaClient,
  actorId: string,
  id: string,
  body: unknown,
) {
  const input = couponPatchSchema.parse(body);
  if (!uuid.safeParse(id).success) throw notFound("Coupon not found");
  const promotionId = await prisma.$transaction(async (tx) => {
    const before = await tx.coupon.findUnique({ where: { id } });
    if (!before) throw notFound("Coupon not found");
    const after = await tx.coupon.update({
      where: { id },
      data: {
        ...(input.userId !== undefined ? { userId: input.userId } : {}),
        ...(input.maxRedemptions !== undefined ? { maxRedemptions: input.maxRedemptions } : {}),
        ...(input.perUserLimit !== undefined ? { perUserLimit: input.perUserLimit } : {}),
        ...(input.startsAt !== undefined
          ? { startsAt: input.startsAt ? new Date(input.startsAt) : null }
          : {}),
        ...(input.endsAt !== undefined
          ? { endsAt: input.endsAt ? new Date(input.endsAt) : null }
          : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
    await recordAudit(tx, {
      actorId,
      action: "coupon.update",
      entityType: "Coupon",
      entityId: id,
      before: { code: before.code, active: before.active, maxRedemptions: before.maxRedemptions },
      after: {
        code: after.code,
        active: after.active,
        maxRedemptions: after.maxRedemptions,
        changed: Object.keys(input),
      },
    });
    return after.promotionId;
  });
  return getAdminPromotion(prisma, promotionId);
}

/** Un cupón ya usado no se borra (conserva el historial): se desactiva. */
export async function deleteCoupon(prisma: PrismaClient, actorId: string, id: string) {
  if (!uuid.safeParse(id).success) throw notFound("Coupon not found");
  await prisma.$transaction(async (tx) => {
    const coupon = await tx.coupon.findUnique({ where: { id } });
    if (!coupon) throw notFound("Coupon not found");
    if ((await tx.couponRedemption.count({ where: { couponId: id } })) > 0) {
      throw conflict("COUPON_HAS_USES", "This coupon has been used: deactivate it instead");
    }
    await tx.coupon.delete({ where: { id } });
    await recordAudit(tx, {
      actorId,
      action: "coupon.delete",
      entityType: "Coupon",
      entityId: id,
      before: { code: coupon.code },
    });
  });
}
