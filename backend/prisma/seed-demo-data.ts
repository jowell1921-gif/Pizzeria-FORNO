/**
 * DATOS DE DEMOSTRACIÓN.
 *
 * Todo lo que se siembra aquí es de ejemplo (la carta, los precios, los horarios, las zonas y la
 * regla de puntos): no son datos comerciales reales. Son los mismos datos que muestra la web en
 * `frontend/src/lib/demo-data.ts`, hasta que la web los lea de la API.
 *
 * El sembrado es idempotente: se puede ejecutar varias veces y deja los mismos datos.
 * No crea usuarios: los usuarios nacen en Supabase Auth.
 */
import type { PrismaClient } from "../src/db/client.js";

const ALLERGENS = [
  ["gluten", "Gluten"],
  ["crustaceos", "Crustáceos"],
  ["huevos", "Huevos"],
  ["pescado", "Pescado"],
  ["cacahuetes", "Cacahuetes"],
  ["soja", "Soja"],
  ["lacteos", "Lácteos"],
  ["frutos-secos", "Frutos secos"],
  ["apio", "Apio"],
  ["mostaza", "Mostaza"],
  ["sesamo", "Granos de sésamo"],
  ["sulfitos", "Dióxido de azufre y sulfitos"],
  ["altramuces", "Altramuces"],
  ["moluscos", "Moluscos"],
] as const;

const CATEGORIES = [
  {
    slug: "pizzas",
    name: "Pizzas",
    description: "Masa de fermentación lenta, cocida en horno de leña.",
  },
  { slug: "entrantes", name: "Entrantes", description: "Para compartir mientras llega la pizza." },
  { slug: "bebidas", name: "Bebidas", description: "Frías y listas para acompañar." },
  { slug: "postres", name: "Postres", description: "El final que se merece la cena." },
] as const;

interface DemoProduct {
  slug: string;
  category: (typeof CATEGORIES)[number]["slug"];
  name: string;
  description: string;
  price: string;
  taxRate?: string;
  ingredients: string[];
  allergens: string[];
  vegetarian: boolean;
  popular?: boolean;
  available?: boolean;
  image?: string;
}

/**
 * IVA (precios con IVA incluido). Tipos vigentes en 2026 según la Agencia Tributaria, para pedidos
 * de recogida y a domicilio:
 *  - 10 %: comida preparada (pizzas, entrantes, postres) y agua.
 *  - 21 %: bebidas alcohólicas y bebidas refrescantes, zumos y gaseosas con azúcares o edulcorantes
 *    añadidos. Ver docs/decisions/0004-iva.md.
 * Si un producto no indica `taxRate`, se usa el 10 %.
 */
const PRODUCTS: DemoProduct[] = [
  {
    slug: "margherita",
    category: "pizzas",
    name: "Margherita",
    description: "La clásica: sencilla, intensa y siempre acertada.",
    price: "9.50",
    ingredients: ["Tomate San Marzano", "Mozzarella fior di latte", "Albahaca", "Aceite de oliva"],
    allergens: ["gluten", "lacteos"],
    vegetarian: true,
    popular: true,
    image: "/image/pizza-margherita-tabla.webp",
  },
  {
    slug: "diavola",
    image: "/image/pizza-diavola.webp",
    category: "pizzas",
    name: "Diavola",
    description: "Con carácter: salame picante y un toque de guindilla.",
    price: "11.50",
    ingredients: ["Tomate", "Mozzarella", "Salame picante", "Guindilla"],
    allergens: ["gluten", "lacteos"],
    vegetarian: false,
    popular: true,
  },
  {
    slug: "quattro-formaggi",
    image: "/image/pizza-quattro-formaggi.webp",
    category: "pizzas",
    name: "Quattro Formaggi",
    description: "Cuatro quesos fundidos para los más golosos.",
    price: "12.00",
    ingredients: ["Mozzarella", "Gorgonzola", "Parmesano", "Provolone"],
    allergens: ["gluten", "lacteos"],
    vegetarian: true,
    popular: true,
  },
  {
    slug: "prosciutto-funghi",
    image: "/image/pizza-prosciutto-funghi.webp",
    category: "pizzas",
    name: "Prosciutto e Funghi",
    description: "Jamón cocido y champiñón salteado sobre tomate y mozzarella.",
    price: "11.50",
    ingredients: ["Tomate", "Mozzarella", "Jamón cocido", "Champiñón"],
    allergens: ["gluten", "lacteos"],
    vegetarian: false,
  },
  {
    slug: "vegetariana",
    image: "/image/pizza-vegetariana.webp",
    category: "pizzas",
    name: "Vegetariana",
    description: "Verduras de temporada asadas con mozzarella.",
    price: "11.00",
    ingredients: ["Tomate", "Mozzarella", "Calabacín", "Pimiento", "Cebolla roja"],
    allergens: ["gluten", "lacteos"],
    vegetarian: true,
  },
  {
    slug: "burrata",
    image: "/image/pizza-napolitana.webp",
    category: "pizzas",
    name: "Burrata",
    description: "Burrata cremosa al salir del horno sobre tomate fresco.",
    price: "13.00",
    ingredients: ["Tomate", "Burrata", "Rúcula", "Pesto de albahaca"],
    allergens: ["gluten", "lacteos", "frutos-secos"],
    vegetarian: true,
  },
  {
    slug: "focaccia",
    image: "/image/entrante-focaccia.webp",
    category: "entrantes",
    name: "Focaccia al romero",
    description: "Focaccia recién horneada con aceite y sal en escamas.",
    price: "5.50",
    ingredients: ["Masa madre", "Romero", "Aceite de oliva", "Sal en escamas"],
    allergens: ["gluten"],
    vegetarian: true,
  },
  {
    slug: "burrata-tomate",
    image: "/image/entrante-burrata.webp",
    category: "entrantes",
    name: "Burrata con tomate",
    description: "Burrata sobre tomate maduro y albahaca.",
    price: "8.50",
    ingredients: ["Burrata", "Tomate", "Albahaca", "Aceite de oliva"],
    allergens: ["lacteos"],
    vegetarian: true,
    popular: true,
  },
  {
    slug: "provolone",
    image: "/image/entrante-provolone.webp",
    category: "entrantes",
    name: "Provolone al horno",
    description: "Queso provolone fundido con orégano y pan tostado.",
    price: "7.00",
    ingredients: ["Provolone", "Orégano", "Pan"],
    allergens: ["gluten", "lacteos"],
    vegetarian: true,
  },
  {
    slug: "agua",
    image: "/image/bebida-agua.webp",
    category: "bebidas",
    name: "Agua mineral",
    description: "Botella de 50 cl.",
    price: "2.00",
    ingredients: [],
    allergens: [],
    vegetarian: true,
  },
  {
    slug: "refresco-cola",
    image: "/image/bebida-cola.webp",
    category: "bebidas",
    name: "Refresco de cola",
    description: "Lata de 33 cl.",
    price: "2.50",
    // Bebida refrescante con azúcares o edulcorantes añadidos: 21 % (art. 91.Uno.1.1º LIVA).
    taxRate: "21.00",
    ingredients: [],
    allergens: [],
    vegetarian: true,
  },
  {
    slug: "limonada",
    image: "/image/bebida-limonada.webp",
    category: "bebidas",
    name: "Limonada artesana",
    description: "Limón, menta y un toque de azúcar de caña.",
    price: "3.00",
    // Lleva azúcar añadido: bebida refrescante con azúcares, 21 %.
    taxRate: "21.00",
    ingredients: ["Limón", "Menta", "Azúcar de caña"],
    allergens: [],
    vegetarian: true,
  },
  {
    slug: "cerveza",
    image: "/image/bebida-cerveza.webp",
    category: "bebidas",
    name: "Cerveza lager",
    description: "Botellín de 33 cl. Solo para mayores de edad.",
    price: "3.00",
    taxRate: "21.00",
    ingredients: [],
    allergens: ["gluten"],
    vegetarian: true,
    available: false,
  },
  {
    slug: "tiramisu",
    image: "/image/postre-tiramisu.webp",
    category: "postres",
    name: "Tiramisú",
    description: "Receta casera con mascarpone y café.",
    price: "5.50",
    ingredients: ["Mascarpone", "Café", "Bizcocho", "Cacao"],
    allergens: ["gluten", "lacteos", "huevos"],
    vegetarian: true,
    popular: true,
  },
  {
    slug: "panna-cotta",
    image: "/image/postre-panna-cotta.webp",
    category: "postres",
    name: "Panna cotta",
    description: "Con coulis de frutos rojos.",
    price: "5.00",
    ingredients: ["Nata", "Vainilla", "Frutos rojos"],
    allergens: ["lacteos"],
    vegetarian: true,
  },
];

/** Opciones configurables de todas las pizzas: tamaño, masa y extras. */
const PIZZA_OPTION_GROUPS = [
  {
    name: "Tamaño",
    kind: "SIZE",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    options: [
      { name: "Mediana", priceDelta: "0.00", isDefault: true },
      { name: "Familiar", priceDelta: "4.00", isDefault: false },
    ],
  },
  {
    name: "Tipo de masa",
    kind: "DOUGH",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    options: [
      { name: "Clásica", priceDelta: "0.00", isDefault: true },
      { name: "Integral", priceDelta: "1.00", isDefault: false },
      { name: "Fina", priceDelta: "0.00", isDefault: false },
    ],
  },
  {
    name: "Ingredientes adicionales",
    kind: "EXTRA_INGREDIENT",
    required: false,
    minSelect: 0,
    maxSelect: 4,
    options: [
      { name: "Mozzarella extra", priceDelta: "1.50", isDefault: false },
      { name: "Champiñón", priceDelta: "1.00", isDefault: false },
      { name: "Jamón cocido", priceDelta: "1.50", isDefault: false },
      { name: "Salame picante", priceDelta: "1.50", isDefault: false },
    ],
  },
] as const;

// Horario semanal de ejemplo. dayOfWeek ISO (1 = lunes), minutos desde las 00:00. El lunes cierra.
const OPENING_HOURS = [
  ...[2, 3, 4].flatMap((day) => [
    { dayOfWeek: day, openMinute: 13 * 60, closeMinute: 16 * 60 },
    { dayOfWeek: day, openMinute: 20 * 60, closeMinute: 23 * 60 },
  ]),
  ...[5, 6].flatMap((day) => [
    { dayOfWeek: day, openMinute: 13 * 60, closeMinute: 16 * 60 },
    { dayOfWeek: day, openMinute: 20 * 60, closeMinute: 24 * 60 },
  ]),
  { dayOfWeek: 7, openMinute: 13 * 60, closeMinute: 17 * 60 },
  { dayOfWeek: 7, openMinute: 20 * 60, closeMinute: 23 * 60 },
];

const DELIVERY_ZONES = [
  {
    name: "Centro (demostración)",
    postalCodes: ["28001", "28002", "28003"],
    deliveryFee: "2.50",
    minimumOrder: "12.00",
    estimatedMinutes: 35,
  },
  {
    name: "Norte (demostración)",
    postalCodes: ["28010", "28020"],
    deliveryFee: "3.50",
    minimumOrder: "15.00",
    estimatedMinutes: 45,
  },
];

export interface SeedSummary {
  allergens: number;
  categories: number;
  products: number;
  optionGroups: number;
  openingHours: number;
  deliveryZones: number;
  promotions: number;
  coupons: number;
  rewards: number;
}

export async function seedDemoData(prisma: PrismaClient): Promise<SeedSummary> {
  // Alérgenos (los 14 de declaración obligatoria en la UE).
  for (const [code, name] of ALLERGENS) {
    await prisma.allergen.upsert({ where: { code }, update: { name }, create: { code, name } });
  }

  // Categorías.
  const categoryIds = new Map<string, string>();
  for (const [index, category] of CATEGORIES.entries()) {
    const saved = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, description: category.description, sortOrder: index },
      create: { ...category, sortOrder: index },
    });
    categoryIds.set(category.slug, saved.id);
  }

  // Productos, ingredientes, alérgenos, imágenes y opciones.
  const productIds = new Map<string, string>();
  for (const [index, product] of PRODUCTS.entries()) {
    const data = {
      categoryId: categoryIds.get(product.category)!,
      name: product.name,
      description: product.description,
      basePrice: product.price,
      taxRate: product.taxRate ?? "10.00",
      vegetarian: product.vegetarian,
      popular: product.popular ?? false,
      available: product.available ?? true,
      sortOrder: index,
    };
    const saved = await prisma.product.upsert({
      where: { slug: product.slug },
      update: data,
      create: { slug: product.slug, ...data },
    });
    productIds.set(product.slug, saved.id);

    await prisma.productIngredient.deleteMany({ where: { productId: saved.id } });
    for (const [position, ingredientName] of product.ingredients.entries()) {
      const ingredient = await prisma.ingredient.upsert({
        where: { name: ingredientName },
        update: {},
        create: { name: ingredientName },
      });
      await prisma.productIngredient.create({
        data: { productId: saved.id, ingredientId: ingredient.id, position },
      });
    }

    await prisma.productAllergen.deleteMany({ where: { productId: saved.id } });
    for (const code of product.allergens) {
      const allergen = await prisma.allergen.findUniqueOrThrow({ where: { code } });
      await prisma.productAllergen.create({
        data: { productId: saved.id, allergenId: allergen.id },
      });
    }

    await prisma.productImage.deleteMany({ where: { productId: saved.id } });
    if (product.image) {
      await prisma.productImage.create({
        data: { productId: saved.id, url: product.image, alt: "", isPrimary: true },
      });
    }

    if (product.category === "pizzas") {
      await prisma.optionGroup.deleteMany({ where: { productId: saved.id } });
      for (const [groupIndex, group] of PIZZA_OPTION_GROUPS.entries()) {
        await prisma.optionGroup.create({
          data: {
            productId: saved.id,
            name: group.name,
            kind: group.kind,
            required: group.required,
            minSelect: group.minSelect,
            maxSelect: group.maxSelect,
            sortOrder: groupIndex,
            options: {
              create: group.options.map((option, optionIndex) => ({
                ...option,
                sortOrder: optionIndex,
              })),
            },
          },
        });
      }
    }
  }

  // Ajustes de la tienda (fila única).
  const settings = {
    name: "FORNO",
    addressLine: "Calle Ejemplo 12",
    postalCode: "28000",
    city: "Madrid",
    phone: "+34 900 000 000",
    email: "hola@forno.example",
    prepTimeMinutes: 20,
    deliveryTimeMinutes: 40,
    enabledPaymentMethods: ["ONLINE", "CASH_PICKUP", "CASH_DELIVERY"] as (
      "ONLINE" | "CASH_PICKUP" | "CASH_DELIVERY"
    )[],
    // Regla de ejemplo: 1 punto por euro. En producción la fija el propietario desde el panel.
    loyaltyPointsPerEuro: "1.0000",
  };
  await prisma.storeSettings.upsert({
    where: { id: 1 },
    update: settings,
    create: { id: 1, ...settings },
  });

  // Horarios semanales.
  await prisma.openingHours.deleteMany();
  await prisma.openingHours.createMany({ data: OPENING_HOURS });

  // Zonas de reparto.
  for (const zone of DELIVERY_ZONES) {
    const existing = await prisma.deliveryZone.findFirst({ where: { name: zone.name } });
    if (existing) await prisma.deliveryZone.update({ where: { id: existing.id }, data: zone });
    else await prisma.deliveryZone.create({ data: zone });
  }

  // Promociones y cupón de bienvenida.
  const promotions = [
    {
      name: "10 % en tu primer pedido",
      description: "Regístrate, haz tu primer pedido online y ahorra un 10 % en la compra.",
      badge: "Bienvenida",
      kind: "DISCOUNT" as const,
      discountType: "PERCENT" as const,
      discountValue: "10.00",
      firstOrderOnly: true,
      perUserLimit: 1,
      conditions: [
        "Solo para clientes registrados.",
        "Un uso por cliente.",
        "No acumulable con otras ofertas.",
      ],
    },
    {
      name: "Menú FORNO",
      description: "Una pizza clásica, una bebida y un postre por un precio cerrado.",
      badge: "Combo",
      kind: "COMBO" as const,
      comboPrice: "15.90",
      conditions: [
        "Pizzas clásicas del menú.",
        "Bebida sin alcohol.",
        "Postre a elegir entre tiramisú y panna cotta.",
      ],
    },
    {
      name: "Envío gratis",
      description: "Sin gastos de envío en pedidos a domicilio a partir de un importe mínimo.",
      badge: "Envío",
      kind: "DISCOUNT" as const,
      discountType: "FIXED" as const,
      discountValue: "2.50",
      minSubtotal: "25.00",
      conditions: ["Solo entrega a domicilio dentro de la zona de reparto."],
    },
  ];
  const promotionIds = new Map<string, string>();
  for (const promotion of promotions) {
    const existing = await prisma.promotion.findFirst({ where: { name: promotion.name } });
    const saved = existing
      ? await prisma.promotion.update({ where: { id: existing.id }, data: promotion })
      : await prisma.promotion.create({ data: promotion });
    promotionIds.set(promotion.name, saved.id);
  }
  await prisma.coupon.upsert({
    where: { code: "BIENVENIDO10" },
    update: { promotionId: promotionIds.get("10 % en tu primer pedido")! },
    create: {
      code: "BIENVENIDO10",
      promotionId: promotionIds.get("10 % en tu primer pedido")!,
      perUserLimit: 1,
    },
  });

  // Recompensas de FORNO CLUB.
  const rewards = [
    {
      name: "Bebida gratis",
      pointsCost: 100,
      freeProductId: productIds.get("agua")!,
      sortOrder: 0,
    },
    {
      name: "Entrante a elegir",
      pointsCost: 250,
      freeProductId: productIds.get("focaccia")!,
      sortOrder: 1,
    },
    {
      name: "Pizza clásica gratis",
      pointsCost: 400,
      freeProductId: productIds.get("margherita")!,
      sortOrder: 2,
    },
  ];
  for (const reward of rewards) {
    const existing = await prisma.reward.findFirst({ where: { name: reward.name } });
    if (existing) await prisma.reward.update({ where: { id: existing.id }, data: reward });
    else await prisma.reward.create({ data: reward });
  }

  return {
    allergens: await prisma.allergen.count(),
    categories: await prisma.category.count(),
    products: await prisma.product.count(),
    optionGroups: await prisma.optionGroup.count(),
    openingHours: await prisma.openingHours.count(),
    deliveryZones: await prisma.deliveryZone.count(),
    promotions: await prisma.promotion.count(),
    coupons: await prisma.coupon.count(),
    rewards: await prisma.reward.count(),
  };
}
