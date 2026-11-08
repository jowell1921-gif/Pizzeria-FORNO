import { z } from "zod";

/**
 * Forma de las respuestas públicas de la API (ver docs/api). Se validan al recibirlas: si el
 * contrato cambia sin avisar, falla aquí con un error claro y no más adelante en la interfaz.
 */
const money = z.string();

export const categorySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
});

const optionSchema = z.object({
  id: z.string(),
  name: z.string(),
  priceDelta: money,
  isDefault: z.boolean(),
  available: z.boolean(),
});

export const optionGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["SIZE", "DOUGH", "EXTRA_INGREDIENT", "EXTRA"]),
  required: z.boolean(),
  minSelect: z.number(),
  maxSelect: z.number(),
  options: z.array(optionSchema),
});

const imageSchema = z.object({ url: z.string(), alt: z.string(), isPrimary: z.boolean() });

export const productSchema = z.object({
  id: z.string(),
  slug: z.string(),
  categoryId: z.string(),
  categorySlug: z.string(),
  name: z.string(),
  description: z.string(),
  /** Precio base con IVA incluido. El importe final lo calcula siempre el servidor. */
  price: money,
  vegetarian: z.boolean(),
  available: z.boolean(),
  popular: z.boolean(),
  image: imageSchema.nullable(),
  ingredients: z.array(z.string()),
  allergens: z.array(z.object({ code: z.string(), name: z.string() })),
  optionGroups: z.array(optionGroupSchema),
});

export const promotionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  badge: z.string().nullable(),
  kind: z.enum(["DISCOUNT", "COMBO"]),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  conditions: z.array(z.string()),
  code: z.string().nullable(),
});

export const storeSettingsSchema = z.object({
  name: z.string(),
  timezone: z.string(),
  slotMinutes: z.number(),
  maxAdvanceDays: z.number(),
  prepTimeMinutes: z.number(),
  deliveryTimeMinutes: z.number(),
  pickupEnabled: z.boolean(),
  deliveryEnabled: z.boolean(),
  ordersPaused: z.boolean(),
  pausedMessage: z.string().nullable(),
  enabledPaymentMethods: z.array(z.enum(["ONLINE", "CASH_PICKUP", "CASH_DELIVERY"])),
  open: z.boolean(),
});

export const deliveryZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  postalCodes: z.array(z.string()),
  deliveryFee: z.string(),
  minimumOrder: z.string(),
  estimatedMinutes: z.number(),
});

export const loyaltyProgramSchema = z.object({
  pointsPerEuro: z.string().nullable(),
  expiryDays: z.number().nullable(),
  rewards: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      pointsCost: z.number(),
      inStock: z.boolean(),
    }),
  ),
});

export const slotsSchema = z.object({
  type: z.enum(["PICKUP", "DELIVERY"]),
  date: z.string(),
  asapAvailable: z.boolean(),
  slotMinutes: z.number(),
  slots: z.array(z.string()),
});

export type Category = z.infer<typeof categorySchema>;
export type OptionGroup = z.infer<typeof optionGroupSchema>;
export type Product = z.infer<typeof productSchema>;
export type Promotion = z.infer<typeof promotionSchema>;
export type StoreSettings = z.infer<typeof storeSettingsSchema>;
export type LoyaltyProgram = z.infer<typeof loyaltyProgramSchema>;
export type Slots = z.infer<typeof slotsSchema>;
