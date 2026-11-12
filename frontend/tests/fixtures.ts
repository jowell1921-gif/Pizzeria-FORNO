import type { Product, Promotion } from "@/features/catalog/schemas";

/** Producto con la forma exacta de la respuesta de la API (ver docs/api). */
export function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "margherita",
    categoryId: "22222222-2222-4222-8222-222222222222",
    categorySlug: "pizzas",
    name: "Margherita",
    description: "La clásica: sencilla, intensa y siempre acertada.",
    price: "9.50",
    vegetarian: true,
    available: true,
    popular: true,
    image: { url: "/image/pizza-margherita-tabla.webp", alt: "", isPrimary: true },
    ingredients: ["Tomate San Marzano", "Mozzarella fior di latte", "Albahaca"],
    allergens: [
      { code: "gluten", name: "Gluten" },
      { code: "lacteos", name: "Lácteos" },
    ],
    optionGroups: [
      {
        id: "g-size",
        name: "Tamaño",
        kind: "SIZE",
        required: true,
        minSelect: 1,
        maxSelect: 1,
        options: [
          { id: "o-medium", name: "Mediana", priceDelta: "0.00", isDefault: true, available: true },
          {
            id: "o-family",
            name: "Familiar",
            priceDelta: "4.00",
            isDefault: false,
            available: true,
          },
        ],
      },
      {
        id: "g-extras",
        name: "Ingredientes adicionales",
        kind: "EXTRA_INGREDIENT",
        required: false,
        minSelect: 0,
        maxSelect: 2,
        options: [
          {
            id: "o-cheese",
            name: "Mozzarella extra",
            priceDelta: "1.50",
            isDefault: false,
            available: true,
          },
          { id: "o-ham", name: "Jamón", priceDelta: "1.75", isDefault: false, available: true },
          {
            id: "o-olives",
            name: "Aceitunas",
            priceDelta: "1.00",
            isDefault: false,
            available: true,
          },
        ],
      },
    ],
    ...overrides,
  };
}

export const noOptionsProduct = makeProduct({
  id: "33333333-3333-4333-8333-333333333333",
  slug: "agua",
  name: "Agua",
  price: "1.80",
  ingredients: [],
  allergens: [],
  optionGroups: [],
  image: null,
  vegetarian: false,
});

export function makePromotion(overrides: Partial<Promotion> = {}): Promotion {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    name: "10 % en tu primer pedido",
    description: "Regístrate, haz tu primer pedido online y ahorra un 10 % en la compra.",
    badge: "Bienvenida",
    kind: "DISCOUNT",
    startsAt: null,
    endsAt: null,
    conditions: ["Solo para clientes registrados.", "Un uso por cliente."],
    code: "BIENVENIDO10",
    ...overrides,
  };
}

export const comboPromotion = makePromotion({
  id: "55555555-5555-4555-8555-555555555555",
  name: "Menú FORNEA",
  badge: "Combo",
  kind: "COMBO",
  code: null,
});
