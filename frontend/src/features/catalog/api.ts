import { z } from "zod";

import { apiRequest } from "@/lib/api";

import {
  categorySchema,
  deliveryZoneSchema,
  loyaltyProgramSchema,
  productSchema,
  promotionSchema,
  slotsSchema,
  storeSettingsSchema,
  type Category,
  type LoyaltyProgram,
  type Product,
  type Promotion,
} from "./schemas";

/** Resultado de una carga: nunca lanza, para que la página pueda mostrar un aviso en lugar de romperse. */
export type Loaded<T> = { ok: true; data: T } | { ok: false };

async function load<T>(request: Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await request };
  } catch {
    return { ok: false };
  }
}

export const fetchCategories = () => apiRequest("/categories", { schema: z.array(categorySchema) });
export const fetchProducts = () => apiRequest("/products", { schema: z.array(productSchema) });
export const fetchPromotions = () =>
  apiRequest("/promotions", { schema: z.array(promotionSchema) });
export const fetchStoreSettings = () =>
  apiRequest("/store/settings", { schema: storeSettingsSchema });
export const fetchDeliveryZones = () =>
  apiRequest("/delivery-zones", { schema: z.array(deliveryZoneSchema) });
export const fetchLoyaltyProgram = () =>
  apiRequest("/loyalty/program", { schema: loyaltyProgramSchema });
export const fetchSlots = (type: "PICKUP" | "DELIVERY", date?: string) =>
  apiRequest("/store/slots", { query: { type, ...(date ? { date } : {}) }, schema: slotsSchema });

export const getCategories = (): Promise<Loaded<Category[]>> => load(fetchCategories());
export const getProducts = (): Promise<Loaded<Product[]>> => load(fetchProducts());
export const getLoyaltyProgram = (): Promise<Loaded<LoyaltyProgram>> => load(fetchLoyaltyProgram());
export const getPromotions = (): Promise<Loaded<Promotion[]>> => load(fetchPromotions());
