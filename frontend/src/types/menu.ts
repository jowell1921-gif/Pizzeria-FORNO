import type { SiteImage } from "@/types/media";

export type CategoryId = "pizzas" | "entrantes" | "bebidas" | "postres";

export type AllergenId =
  "gluten" | "lacteos" | "huevos" | "pescado" | "frutos-secos" | "sulfitos" | "soja" | "apio";

export interface Category {
  id: CategoryId;
  name: string;
  description: string;
}

export interface Product {
  id: string;
  categoryId: CategoryId;
  name: string;
  description: string;
  /** Importe decimal con IVA incluido, como cadena ("9.50"). El cálculo real lo hace el backend. */
  price: string;
  ingredients: string[];
  allergens: AllergenId[];
  /** Fotografía del producto. Si falta, se muestra una ilustración. */
  image?: SiteImage;
  vegetarian: boolean;
  popular: boolean;
  available: boolean;
}

export interface Promotion {
  id: string;
  title: string;
  description: string;
  badge: string;
  validity: string;
  conditions: string[];
  code?: string;
}

export interface Reward {
  id: string;
  name: string;
  points: number;
}

export interface OpeningPeriod {
  days: string;
  hours: string;
}
