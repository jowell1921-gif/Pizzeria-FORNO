import { z } from "zod";

import {
  LoyaltyTransactionType,
  OptionKind,
  PaymentMethod,
  PromotionKind,
  RedemptionStatus,
} from "../generated/prisma/enums.js";

/**
 * Contrato de las respuestas de administración (fase 8B). Igual que `schemas.ts`: una sola
 * definición para la documentación y para las pruebas de contrato.
 */
const values = <T extends Record<string, string>>(object: T) =>
  Object.values(object) as [T[keyof T], ...T[keyof T][]];

const money = z.string().regex(/^-?\d+\.\d{2}$/);
const isoDate = z.iso.datetime();
const id = z.uuid();

export const AdminCategory = z
  .object({
    id,
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    sortOrder: z.number().int(),
    active: z.boolean(),
    productCount: z.number().int(),
  })
  .meta({ id: "AdminCategory" });

export const AdminAllergen = z
  .object({ code: z.string(), name: z.string() })
  .meta({ id: "AdminAllergen" });

export const AdminProduct = z
  .object({
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
    sortOrder: z.number().int(),
    deleted: z.boolean(),
    image: z.object({ url: z.string(), alt: z.string() }).nullable(),
    ingredients: z.array(z.string()),
    allergens: z.array(z.string()),
    optionGroups: z.array(
      z.object({
        id,
        name: z.string(),
        kind: z.enum(values(OptionKind)),
        required: z.boolean(),
        minSelect: z.number().int(),
        maxSelect: z.number().int(),
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
  })
  .meta({ id: "AdminProduct" });

export const AdminStoreSettings = z
  .object({
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
    prepTimeMinutes: z.number().int(),
    deliveryTimeMinutes: z.number().int(),
    pickupEnabled: z.boolean(),
    deliveryEnabled: z.boolean(),
    ordersPaused: z.boolean(),
    pausedMessage: z.string().nullable(),
    enabledPaymentMethods: z.array(z.enum(values(PaymentMethod))),
    slotMinutes: z.number().int(),
    maxAdvanceDays: z.number().int(),
  })
  .meta({ id: "AdminStoreSettings" });

export const OpeningSlot = z
  .object({
    dayOfWeek: z.number().int().min(1).max(7),
    openMinute: z.number().int(),
    closeMinute: z.number().int(),
  })
  .meta({ id: "OpeningSlot" });

export const SpecialDay = z
  .object({
    id,
    date: z.string(),
    closed: z.boolean(),
    openMinute: z.number().int().nullable(),
    closeMinute: z.number().int().nullable(),
    note: z.string().nullable(),
  })
  .meta({ id: "SpecialDay" });

export const AdminZone = z
  .object({
    id,
    name: z.string(),
    postalCodes: z.array(z.string()),
    deliveryFee: money,
    minimumOrder: money,
    estimatedMinutes: z.number().int(),
    active: z.boolean(),
  })
  .meta({ id: "AdminZone" });

export const AdminPromotion = z
  .object({
    id,
    name: z.string(),
    description: z.string(),
    badge: z.string().nullable(),
    kind: z.enum(values(PromotionKind)),
    discountType: z.enum(["PERCENT", "FIXED"]).nullable(),
    discountValue: money.nullable(),
    comboPrice: money.nullable(),
    products: z.array(
      z.object({ productId: id, productName: z.string(), quantity: z.number().int() }),
    ),
    minSubtotal: money.nullable(),
    startsAt: isoDate.nullable(),
    endsAt: isoDate.nullable(),
    maxRedemptions: z.number().int().nullable(),
    perUserLimit: z.number().int().nullable(),
    firstOrderOnly: z.boolean(),
    automatic: z.boolean(),
    active: z.boolean(),
    conditions: z.array(z.string()),
    usage: z.number().int(),
    coupons: z.array(
      z.object({
        id,
        code: z.string(),
        userId: id.nullable(),
        maxRedemptions: z.number().int().nullable(),
        perUserLimit: z.number().int().nullable(),
        startsAt: isoDate.nullable(),
        endsAt: isoDate.nullable(),
        active: z.boolean(),
        usage: z.number().int(),
      }),
    ),
  })
  .meta({ id: "AdminPromotion" });

export const LoyaltySettings = z
  .object({ pointsPerEuro: z.string(), expiryDays: z.number().int().nullable() })
  .meta({ id: "LoyaltySettings" });

export const AdminReward = z
  .object({
    id,
    name: z.string(),
    description: z.string().nullable(),
    pointsCost: z.number().int(),
    freeProduct: z.object({ id, name: z.string() }).nullable(),
    discountAmount: money.nullable(),
    stock: z.number().int().nullable(),
    validFrom: isoDate.nullable(),
    validTo: isoDate.nullable(),
    active: z.boolean(),
    sortOrder: z.number().int(),
    redemptions: z.number().int(),
  })
  .meta({ id: "AdminReward" });

const customerRef = z.object({ id, fullName: z.string(), email: z.string() });

export const AdminTransaction = z
  .object({
    id,
    type: z.enum(values(LoyaltyTransactionType)),
    points: z.number().int(),
    balanceAfter: z.number().int(),
    reason: z.string().nullable(),
    orderNumber: z.number().int().nullable(),
    createdAt: isoDate,
    createdBy: z.string().nullable(),
    customer: customerRef,
  })
  .meta({ id: "AdminTransaction" });

export const AdminRedemption = z
  .object({
    id,
    rewardName: z.string(),
    pointsSpent: z.number().int(),
    status: z.enum(values(RedemptionStatus)),
    orderNumber: z.number().int().nullable(),
    createdAt: isoDate,
    usedAt: isoDate.nullable(),
    customer: customerRef,
  })
  .meta({ id: "AdminRedemption" });

export const Customer = z
  .object({
    id,
    fullName: z.string(),
    username: z.string().nullable(),
    email: z.string(),
    phone: z.string().nullable(),
    orders: z.number().int(),
    balance: z.number().int(),
    lifetimeEarned: z.number().int(),
    createdAt: isoDate,
  })
  .meta({ id: "Customer" });

export const PointsAdjustment = z
  .object({
    id,
    points: z.number().int(),
    balanceAfter: z.number().int(),
    reason: z.string().nullable(),
    balance: z.number().int(),
  })
  .meta({ id: "PointsAdjustment" });

export const AuditEntry = z
  .object({
    id,
    action: z.string(),
    entityType: z.string(),
    entityId: z.string().nullable(),
    actor: z.object({ fullName: z.string(), email: z.string() }).nullable(),
    before: z.unknown(),
    after: z.unknown(),
    reason: z.string().nullable(),
    createdAt: isoDate,
  })
  .meta({ id: "AuditEntry" });

export const AdminNotification = z
  .object({
    id,
    template: z.string(),
    recipient: z.string(),
    subject: z.string().nullable(),
    body: z.string().nullable(),
    status: z.enum(["PENDING", "SENT", "FAILED", "LOGGED"]),
    attempts: z.number().int(),
    lastError: z.string().nullable(),
    orderNumber: z.number().int().nullable(),
    createdAt: isoDate,
    sentAt: isoDate.nullable(),
  })
  .meta({ id: "AdminNotification" });

export const DocumentInfo = z
  .object({
    type: z.enum(["INVOICE", "RECEIPT"]),
    number: z.string(),
    issuedAt: isoDate,
    total: money,
  })
  .meta({ id: "DocumentInfo" });

export const OrderDocuments = z
  .object({ settled: z.boolean(), documents: z.array(DocumentInfo) })
  .meta({ id: "OrderDocuments" });

export const PaymentSession = z.object({ url: z.url() }).meta({ id: "PaymentSession" });

export const UploadResult = z.object({ url: z.string() }).meta({ id: "UploadResult" });

/** Referencias para que TypeScript no elimine los esquemas registrados con `.meta({ id })`. */
export const ADMIN_SCHEMAS = [
  AdminCategory,
  AdminAllergen,
  AdminProduct,
  AdminStoreSettings,
  OpeningSlot,
  SpecialDay,
  AdminZone,
  AdminPromotion,
  LoyaltySettings,
  AdminReward,
  AdminTransaction,
  AdminRedemption,
  Customer,
  PointsAdjustment,
  AuditEntry,
  UploadResult,
  AdminNotification,
  DocumentInfo,
  OrderDocuments,
  PaymentSession,
];
