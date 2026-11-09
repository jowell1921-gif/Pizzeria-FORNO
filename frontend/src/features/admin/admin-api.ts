import { z } from "zod";

import { API_URL, ApiError, apiRequest, apiRequestPage, apiRequestVoid } from "@/lib/api";

/**
 * Cliente de la API de administración (fase 8B). Los esquemas validan lo que responde el servidor
 * (ver `backend/src/docs/schemas-admin.ts`); el servidor vuelve a validar y autorizar cada escritura.
 */
const id = z.string();
const money = z.string();

export const categorySchema = z.object({
  id,
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number(),
  active: z.boolean(),
  productCount: z.number(),
});

export const allergenSchema = z.object({ code: z.string(), name: z.string() });

const optionKind = z.enum(["SIZE", "DOUGH", "EXTRA_INGREDIENT", "EXTRA"]);

export const productSchema = z.object({
  id,
  slug: z.string(),
  categoryId: id,
  categoryName: z.string(),
  name: z.string(),
  description: z.string(),
  basePrice: money,
  taxRate: money,
  vegetarian: z.boolean(),
  available: z.boolean(),
  popular: z.boolean(),
  sortOrder: z.number(),
  deleted: z.boolean(),
  image: z.object({ url: z.string(), alt: z.string() }).nullable(),
  ingredients: z.array(z.string()),
  allergens: z.array(z.string()),
  optionGroups: z.array(
    z.object({
      id,
      name: z.string(),
      kind: optionKind,
      required: z.boolean(),
      minSelect: z.number(),
      maxSelect: z.number(),
      options: z.array(
        z.object({
          id,
          name: z.string(),
          priceDelta: money,
          isDefault: z.boolean(),
          available: z.boolean(),
        }),
      ),
    }),
  ),
});

export const storeSettingsSchema = z.object({
  name: z.string(),
  legalName: z.string().nullable(),
  taxId: z.string().nullable(),
  addressLine: z.string(),
  postalCode: z.string(),
  city: z.string(),
  phone: z.string(),
  email: z.string(),
  timezone: z.string(),
  currency: z.string(),
  prepTimeMinutes: z.number(),
  deliveryTimeMinutes: z.number(),
  pickupEnabled: z.boolean(),
  deliveryEnabled: z.boolean(),
  ordersPaused: z.boolean(),
  pausedMessage: z.string().nullable(),
  enabledPaymentMethods: z.array(z.enum(["ONLINE", "CASH_PICKUP", "CASH_DELIVERY"])),
  slotMinutes: z.number(),
  maxAdvanceDays: z.number(),
});

export const openingSlotSchema = z.object({
  dayOfWeek: z.number(),
  openMinute: z.number(),
  closeMinute: z.number(),
});

export const specialDaySchema = z.object({
  id,
  date: z.string(),
  closed: z.boolean(),
  openMinute: z.number().nullable(),
  closeMinute: z.number().nullable(),
  note: z.string().nullable(),
});

export const zoneSchema = z.object({
  id,
  name: z.string(),
  postalCodes: z.array(z.string()),
  deliveryFee: money,
  minimumOrder: money,
  estimatedMinutes: z.number(),
  active: z.boolean(),
});

export const promotionSchema = z.object({
  id,
  name: z.string(),
  description: z.string(),
  badge: z.string().nullable(),
  kind: z.enum(["DISCOUNT", "COMBO"]),
  discountType: z.enum(["PERCENT", "FIXED"]).nullable(),
  discountValue: money.nullable(),
  comboPrice: money.nullable(),
  products: z.array(z.object({ productId: id, productName: z.string(), quantity: z.number() })),
  minSubtotal: money.nullable(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  maxRedemptions: z.number().nullable(),
  perUserLimit: z.number().nullable(),
  firstOrderOnly: z.boolean(),
  automatic: z.boolean(),
  active: z.boolean(),
  conditions: z.array(z.string()),
  usage: z.number(),
  coupons: z.array(
    z.object({
      id,
      code: z.string(),
      userId: id.nullable(),
      maxRedemptions: z.number().nullable(),
      perUserLimit: z.number().nullable(),
      startsAt: z.string().nullable(),
      endsAt: z.string().nullable(),
      active: z.boolean(),
      usage: z.number(),
    }),
  ),
});

export const loyaltySettingsSchema = z.object({
  pointsPerEuro: z.string(),
  expiryDays: z.number().nullable(),
});

export const rewardSchema = z.object({
  id,
  name: z.string(),
  description: z.string().nullable(),
  pointsCost: z.number(),
  freeProduct: z.object({ id, name: z.string() }).nullable(),
  discountAmount: money.nullable(),
  stock: z.number().nullable(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  active: z.boolean(),
  sortOrder: z.number(),
  redemptions: z.number(),
});

const customerRef = z.object({ id, fullName: z.string(), email: z.string() });

export const transactionSchema = z.object({
  id,
  type: z.enum(["EARN", "REDEEM", "REVERSAL", "ADJUSTMENT", "EXPIRATION"]),
  points: z.number(),
  balanceAfter: z.number(),
  reason: z.string().nullable(),
  orderNumber: z.number().nullable(),
  createdAt: z.string(),
  createdBy: z.string().nullable(),
  customer: customerRef,
});

export const redemptionSchema = z.object({
  id,
  rewardName: z.string(),
  pointsSpent: z.number(),
  status: z.enum(["AVAILABLE", "USED", "CANCELLED", "EXPIRED"]),
  orderNumber: z.number().nullable(),
  createdAt: z.string(),
  usedAt: z.string().nullable(),
  customer: customerRef,
});

export const customerSchema = z.object({
  id,
  fullName: z.string(),
  username: z.string().nullable(),
  email: z.string(),
  phone: z.string().nullable(),
  orders: z.number(),
  balance: z.number(),
  lifetimeEarned: z.number(),
  createdAt: z.string(),
});

export const auditSchema = z.object({
  id,
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  actor: z.object({ fullName: z.string(), email: z.string() }).nullable(),
  before: z.unknown(),
  after: z.unknown(),
  reason: z.string().nullable(),
  createdAt: z.string(),
});

export type AdminCategory = z.infer<typeof categorySchema>;
export type AdminProduct = z.infer<typeof productSchema>;
export type StoreSettings = z.infer<typeof storeSettingsSchema>;
export type OpeningSlot = z.infer<typeof openingSlotSchema>;
export type SpecialDay = z.infer<typeof specialDaySchema>;
export type AdminZone = z.infer<typeof zoneSchema>;
export type AdminPromotion = z.infer<typeof promotionSchema>;
export type AdminReward = z.infer<typeof rewardSchema>;
export type LoyaltySettings = z.infer<typeof loyaltySettingsSchema>;

type Body = Record<string, unknown>;

/** Una escritura (POST/PATCH/PUT) que devuelve el recurso. */
const write = <T>(
  token: string,
  method: "POST" | "PATCH" | "PUT",
  path: string,
  body: Body,
  schema: z.ZodType<T>,
) => apiRequest(path, { token, method, body, schema });

// ── Carta ──
export const fetchCategories = (token: string) =>
  apiRequest("/admin/categories", { token, schema: z.array(categorySchema) });
export const saveCategory = (token: string, categoryId: string | null, body: Body) =>
  write(
    token,
    categoryId ? "PATCH" : "POST",
    categoryId ? `/admin/categories/${categoryId}` : "/admin/categories",
    body,
    categorySchema,
  );
export const deleteCategory = (token: string, categoryId: string) =>
  apiRequestVoid(`/admin/categories/${categoryId}`, { token, method: "DELETE" });

export const fetchAllergens = (token: string) =>
  apiRequest("/admin/allergens", { token, schema: z.array(allergenSchema) });

export const fetchProducts = (token: string, query: { status: string; q: string }) =>
  apiRequest("/admin/products", {
    token,
    query: { status: query.status, ...(query.q ? { q: query.q } : {}) },
    schema: z.array(productSchema),
  });
export const fetchProduct = (token: string, productId: string) =>
  apiRequest(`/admin/products/${productId}`, { token, schema: productSchema });
export const saveProduct = (token: string, productId: string | null, body: Body) =>
  write(
    token,
    productId ? "PATCH" : "POST",
    productId ? `/admin/products/${productId}` : "/admin/products",
    body,
    productSchema,
  );
export const deleteProduct = (token: string, productId: string) =>
  apiRequestVoid(`/admin/products/${productId}`, { token, method: "DELETE" });
export const restoreProduct = (token: string, productId: string) =>
  write(token, "POST", `/admin/products/${productId}/restore`, {}, productSchema);

// ── Establecimiento ──
export const fetchStoreSettings = (token: string) =>
  apiRequest("/admin/store/settings", { token, schema: storeSettingsSchema });
export const saveStoreSettings = (token: string, body: Body) =>
  write(token, "PATCH", "/admin/store/settings", body, storeSettingsSchema);

export const fetchOpeningHours = (token: string) =>
  apiRequest("/admin/store/opening-hours", { token, schema: z.array(openingSlotSchema) });
export const saveOpeningHours = (token: string, slots: OpeningSlot[]) =>
  apiRequest("/admin/store/opening-hours", {
    token,
    method: "PUT",
    body: { slots },
    schema: z.array(openingSlotSchema),
  });

export const fetchSpecialDays = (token: string) =>
  apiRequest("/admin/store/special-days", { token, schema: z.array(specialDaySchema) });
export const createSpecialDay = (token: string, body: Body) =>
  write(token, "POST", "/admin/store/special-days", body, specialDaySchema);
export const deleteSpecialDay = (token: string, dayId: string) =>
  apiRequestVoid(`/admin/store/special-days/${dayId}`, { token, method: "DELETE" });

export const fetchZones = (token: string) =>
  apiRequest("/admin/delivery-zones", { token, schema: z.array(zoneSchema) });
export const saveZone = (token: string, zoneId: string | null, body: Body) =>
  write(
    token,
    zoneId ? "PATCH" : "POST",
    zoneId ? `/admin/delivery-zones/${zoneId}` : "/admin/delivery-zones",
    body,
    zoneSchema,
  );
export const deleteZone = (token: string, zoneId: string) =>
  apiRequestVoid(`/admin/delivery-zones/${zoneId}`, { token, method: "DELETE" });

// ── Promociones y cupones ──
export const fetchPromotions = (token: string) =>
  apiRequest("/admin/promotions", { token, schema: z.array(promotionSchema) });
export const savePromotion = (token: string, promotionId: string | null, body: Body) =>
  write(
    token,
    promotionId ? "PATCH" : "POST",
    promotionId ? `/admin/promotions/${promotionId}` : "/admin/promotions",
    body,
    promotionSchema,
  );
export const deletePromotion = (token: string, promotionId: string) =>
  apiRequestVoid(`/admin/promotions/${promotionId}`, { token, method: "DELETE" });
export const createCoupon = (token: string, promotionId: string, body: Body) =>
  apiRequest(`/admin/promotions/${promotionId}/coupons`, {
    token,
    method: "POST",
    body,
    schema: z.unknown(),
  });
export const updateCoupon = (token: string, couponId: string, body: Body) =>
  apiRequest(`/admin/coupons/${couponId}`, {
    token,
    method: "PATCH",
    body,
    schema: z.unknown(),
  });
export const deleteCoupon = (token: string, couponId: string) =>
  apiRequestVoid(`/admin/coupons/${couponId}`, { token, method: "DELETE" });

// ── FORNO CLUB ──
export const fetchLoyaltySettings = (token: string) =>
  apiRequest("/admin/loyalty/settings", { token, schema: loyaltySettingsSchema });
export const saveLoyaltySettings = (token: string, body: Body) =>
  write(token, "PATCH", "/admin/loyalty/settings", body, loyaltySettingsSchema);

export const fetchRewards = (token: string) =>
  apiRequest("/admin/rewards", { token, schema: z.array(rewardSchema) });
export const saveReward = (token: string, rewardId: string | null, body: Body) =>
  write(
    token,
    rewardId ? "PATCH" : "POST",
    rewardId ? `/admin/rewards/${rewardId}` : "/admin/rewards",
    body,
    rewardSchema,
  );
export const deleteReward = (token: string, rewardId: string) =>
  apiRequestVoid(`/admin/rewards/${rewardId}`, { token, method: "DELETE" });

export const fetchTransactions = (token: string, query: Record<string, string | number>) =>
  apiRequestPage("/admin/loyalty/transactions", { token, query, schema: transactionSchema });
export const fetchRedemptions = (token: string, query: Record<string, string | number>) =>
  apiRequestPage("/admin/loyalty/redemptions", { token, query, schema: redemptionSchema });
export const fetchCustomers = (token: string, query: Record<string, string | number>) =>
  apiRequestPage("/admin/customers", { token, query, schema: customerSchema });
export const adjustPoints = (token: string, body: Body) =>
  apiRequest("/admin/loyalty/adjustments", {
    token,
    method: "POST",
    body,
    schema: z.object({ balance: z.number() }),
  });

// ── Auditoría y fotos ──
export const fetchAudit = (token: string, query: Record<string, string | number>) =>
  apiRequestPage("/admin/audit", { token, query, schema: auditSchema });

/** Sube una foto de producto (cuerpo binario, no JSON). Devuelve la URL pública. */
export async function uploadProductImage(token: string, file: File): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/admin/uploads/product-image`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": file.type || "image/png" },
      body: file,
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "No se pudo conectar con el servidor.");
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(
      response.status,
      response.status === 413 ? "IMAGE_TOO_LARGE" : (error?.code ?? "UNKNOWN_ERROR"),
      error?.message ?? "Error inesperado del servidor.",
    );
  }
  return z.object({ data: z.object({ url: z.string() }) }).parse(payload).data.url;
}
