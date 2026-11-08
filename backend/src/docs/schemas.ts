import { z } from "zod";

import {
  DiscountType,
  LoyaltyTransactionType,
  OptionKind,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  PromotionKind,
  RoleName,
} from "../generated/prisma/enums.js";

/**
 * Contrato de las respuestas de la API: una sola definición que sirve para generar la
 * documentación OpenAPI y para comprobar en las pruebas que el servidor responde exactamente así.
 * Los importes son cadenas decimales ("12.50") y las fechas, ISO 8601 en UTC.
 */
const values = <T extends Record<string, string>>(object: T) =>
  Object.values(object) as [T[keyof T], ...T[keyof T][]];

export const money = z
  .string()
  .regex(/^-?\d+\.\d{2}$/)
  .meta({ example: "9.50" });
const isoDate = z.iso.datetime();
const id = z.uuid();

const meta = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const ErrorResponse = z
  .object({
    error: z.object({
      code: z.string().meta({ example: "VALIDATION_ERROR" }),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.uuid(),
    }),
  })
  .meta({ id: "ErrorResponse" });

export const Health = z.object({ status: z.literal("ok") }).meta({ id: "Health" });

export const Category = z
  .object({
    id,
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
  })
  .meta({ id: "Category" });

const productImage = z.object({ url: z.string(), alt: z.string(), isPrimary: z.boolean() });

export const Product = z
  .object({
    id,
    slug: z.string(),
    categoryId: id,
    categorySlug: z.string(),
    name: z.string(),
    description: z.string(),
    price: money,
    taxRate: money,
    vegetarian: z.boolean(),
    available: z.boolean(),
    popular: z.boolean(),
    image: productImage.nullable(),
    images: z.array(productImage),
    ingredients: z.array(z.string()),
    allergens: z.array(z.object({ code: z.string(), name: z.string() })),
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
  .meta({ id: "Product" });

export const Promotion = z
  .object({
    id,
    name: z.string(),
    description: z.string(),
    badge: z.string().nullable(),
    kind: z.enum(values(PromotionKind)),
    discountType: z.enum(values(DiscountType)).nullable(),
    discountValue: money.nullable(),
    comboPrice: money.nullable(),
    minSubtotal: money.nullable(),
    firstOrderOnly: z.boolean(),
    startsAt: isoDate.nullable(),
    endsAt: isoDate.nullable(),
    conditions: z.array(z.string()),
    code: z.string().nullable(),
    products: z.array(z.object({ id, name: z.string(), quantity: z.number().int() })),
  })
  .meta({ id: "Promotion" });

export const StoreSettings = z
  .object({
    name: z.string(),
    address: z.object({ line: z.string(), postalCode: z.string(), city: z.string() }),
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
    loyalty: z.object({ pointsPerEuro: z.string(), expiryDays: z.number().int().nullable() }),
    openingHours: z.array(
      z.object({
        dayOfWeek: z.number().int().min(1).max(7),
        openMinute: z.number().int(),
        closeMinute: z.number().int(),
      }),
    ),
    specialDays: z.array(
      z.object({
        date: z.string(),
        closed: z.boolean(),
        openMinute: z.number().int().nullable(),
        closeMinute: z.number().int().nullable(),
        note: z.string().nullable(),
      }),
    ),
    open: z.boolean(),
  })
  .meta({ id: "StoreSettings" });

export const DeliveryZone = z
  .object({
    id,
    name: z.string(),
    postalCodes: z.array(z.string()),
    deliveryFee: money,
    minimumOrder: money,
    estimatedMinutes: z.number().int(),
  })
  .meta({ id: "DeliveryZone" });

export const DeliveryCheck = z
  .object({ postalCode: z.string(), covered: z.boolean(), zone: DeliveryZone.nullable() })
  .meta({ id: "DeliveryCheck" });

export const Profile = z
  .object({
    id,
    email: z.string(),
    fullName: z.string(),
    username: z.string().nullable(),
    phone: z.string().nullable(),
    profileComplete: z.boolean(),
    marketingConsent: z.boolean(),
    roles: z.array(z.enum(values(RoleName))),
    permissions: z.array(z.string()),
    createdAt: isoDate,
  })
  .meta({ id: "Profile" });

export const Address = z
  .object({
    id,
    label: z.string().nullable(),
    recipientName: z.string(),
    phone: z.string().nullable(),
    line1: z.string(),
    line2: z.string().nullable(),
    postalCode: z.string(),
    city: z.string(),
    province: z.string().nullable(),
    notes: z.string().nullable(),
    isDefault: z.boolean(),
  })
  .meta({ id: "Address" });

const benefit = z.object({
  type: z.enum(["FREE_PRODUCT", "DISCOUNT"]),
  productId: id.nullable(),
  productName: z.string().nullable(),
  amount: money.nullable(),
});

export const Reward = z
  .object({
    id,
    name: z.string(),
    description: z.string().nullable(),
    pointsCost: z.number().int(),
    benefit,
    inStock: z.boolean(),
  })
  .meta({ id: "Reward" });

export const LoyaltyProgram = z
  .object({
    pointsPerEuro: z.string().nullable(),
    expiryDays: z.number().int().nullable(),
    rewards: z.array(Reward),
  })
  .meta({ id: "LoyaltyProgram" });

export const Redemption = z
  .object({
    id,
    rewardId: id,
    rewardName: z.string(),
    pointsSpent: z.number().int(),
    status: z.enum(["AVAILABLE", "USED", "CANCELLED", "EXPIRED"]),
    benefit: benefit.nullable(),
    orderNumber: z.number().int().nullable(),
    createdAt: isoDate,
    usedAt: isoDate.nullable(),
    expiresAt: isoDate.nullable(),
  })
  .meta({ id: "Redemption" });

export const LoyaltyAccount = z
  .object({
    balance: z.number().int(),
    lifetimeEarned: z.number().int(),
    pointsPerEuro: z.string().nullable(),
    expiryDays: z.number().int().nullable(),
    nextReward: z
      .object({
        id,
        name: z.string(),
        pointsCost: z.number().int(),
        pointsMissing: z.number().int(),
        progress: z.number().min(0).max(1),
      })
      .nullable(),
    availableRewards: z.number().int(),
  })
  .meta({ id: "LoyaltyAccount" });

export const LoyaltyTransaction = z
  .object({
    id,
    type: z.enum(values(LoyaltyTransactionType)),
    points: z.number().int(),
    balanceAfter: z.number().int(),
    reason: z.string().nullable(),
    orderNumber: z.number().int().nullable(),
    createdAt: isoDate,
  })
  .meta({ id: "LoyaltyTransaction" });

export const OrderSummary = z
  .object({
    id,
    orderNumber: z.number().int(),
    status: z.enum(values(OrderStatus)),
    type: z.enum(values(OrderType)),
    total: money,
    itemCount: z.number().int(),
    createdAt: isoDate,
  })
  .meta({ id: "OrderSummary" });

export const Order = z
  .object({
    id,
    orderNumber: z.number().int(),
    status: z.enum(values(OrderStatus)),
    type: z.enum(values(OrderType)),
    scheduledFor: isoDate.nullable(),
    estimatedReadyAt: isoDate.nullable(),
    notes: z.string().nullable(),
    createdAt: isoDate,
    delivery: z
      .object({
        name: z.string().nullable(),
        line1: z.string().nullable(),
        line2: z.string().nullable(),
        postalCode: z.string().nullable(),
        city: z.string().nullable(),
        notes: z.string().nullable(),
      })
      .nullable(),
    items: z.array(
      z.object({
        id,
        productName: z.string(),
        quantity: z.number().int(),
        unitPrice: money,
        lineTotal: money,
        options: z.array(z.object({ group: z.string(), name: z.string(), priceDelta: money })),
      }),
    ),
    discounts: z.array(z.object({ description: z.string(), amount: money })),
    totals: z.object({
      subtotal: money,
      discount: money,
      deliveryFee: money,
      tax: money,
      total: money,
    }),
    payments: z.array(
      z.object({
        method: z.enum(values(PaymentMethod)),
        status: z.enum(values(PaymentStatus)),
        amount: money,
      }),
    ),
    history: z.array(z.object({ status: z.enum(values(OrderStatus)), at: isoDate })),
  })
  .meta({ id: "Order" });

/** Envoltorios de respuesta: `{ data }` y `{ data, meta }` en las listas paginadas. */
export const data = <T extends z.ZodType>(schema: T) => z.object({ data: schema });
export const paged = <T extends z.ZodType>(schema: T) => z.object({ data: z.array(schema), meta });

const orderKind = z.enum(["PICKUP", "DELIVERY"]);

export const Quote = z
  .object({
    type: orderKind,
    lines: z.array(
      z.object({
        productId: id,
        productName: z.string(),
        quantity: z.number().int(),
        notes: z.string().nullable(),
        unitPrice: money,
        lineTotal: money,
        options: z.array(
          z.object({ optionId: id, group: z.string(), name: z.string(), priceDelta: money }),
        ),
      }),
    ),
    discounts: z.array(z.object({ description: z.string(), amount: money })),
    totals: z.object({
      subtotal: money,
      discount: money,
      deliveryFee: money,
      tax: money,
      total: money,
    }),
    delivery: z
      .object({
        postalCode: z.string().nullable(),
        covered: z.boolean(),
        zoneName: z.string().nullable(),
        minimumOrder: money.nullable(),
        belowMinimum: z.boolean(),
      })
      .nullable(),
    estimatedMinutes: z.number().int().nullable(),
    pointsToEarn: z.number().int(),
  })
  .meta({ id: "Quote" });

export const Cart = z
  .object({
    items: z.array(
      z.object({
        productId: id,
        quantity: z.number().int(),
        optionIds: z.array(id),
        notes: z.string().nullable(),
      }),
    ),
  })
  .meta({ id: "Cart" });

export const StoreSlots = z
  .object({
    type: orderKind,
    date: z.string(),
    asapAvailable: z.boolean(),
    slotMinutes: z.number().int(),
    slots: z.array(isoDate),
  })
  .meta({ id: "StoreSlots" });
