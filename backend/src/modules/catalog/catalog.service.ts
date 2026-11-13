import { z } from "zod";

import type { Prisma, PrismaClient } from "../../db/client.js";
import { notFound } from "../../errors.js";

/** Los importes viajan como cadenas decimales («12.50») para no perder precisión. */
const money = (value: Prisma.Decimal) => value.toFixed(2);

/** Productos visibles: no borrados y de una categoría activa. */
const visibleProduct = { deletedAt: null, category: { active: true, deletedAt: null } } as const;

const productInclude = {
  category: { select: { slug: true } },
  images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
  ingredients: { orderBy: { position: "asc" }, include: { ingredient: true } },
  allergens: { include: { allergen: true } },
  optionGroups: {
    orderBy: { sortOrder: "asc" },
    include: { options: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } } },
  },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

export const productsQuerySchema = z.object({
  /** Slug de la categoría. */
  category: z.string().trim().min(1).max(60).optional(),
  popular: z.enum(["true", "false"]).optional(),
});

function productView(product: ProductRow) {
  const images = product.images.map((image) => ({
    url: image.url,
    alt: image.alt,
    isPrimary: image.isPrimary,
  }));
  return {
    id: product.id,
    slug: product.slug,
    categoryId: product.categoryId,
    categorySlug: product.category.slug,
    name: product.name,
    description: product.description,
    /** Precio base con IVA incluido. El precio final de un pedido lo calcula siempre el servidor. */
    price: money(product.basePrice),
    taxRate: product.taxRate.toFixed(2),
    vegetarian: product.vegetarian,
    available: product.available,
    popular: product.popular,
    image: images[0] ?? null,
    images,
    ingredients: product.ingredients.map((row) => row.ingredient.name),
    allergens: product.allergens
      .map((row) => ({ code: row.allergen.code, name: row.allergen.name }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    optionGroups: product.optionGroups.map((group) => ({
      id: group.id,
      name: group.name,
      kind: group.kind,
      required: group.required,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      options: group.options.map((option) => ({
        id: option.id,
        name: option.name,
        priceDelta: money(option.priceDelta),
        isDefault: option.isDefault,
        available: option.available,
      })),
    })),
  };
}

/** Categorías activas, en su orden de presentación (público). */
export async function listCategories(prisma: PrismaClient) {
  const rows = await prisma.category.findMany({
    where: { active: true, deletedAt: null },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map((category) => ({
    id: category.id,
    slug: category.slug,
    name: category.name,
    description: category.description,
  }));
}

/** Carta completa (acotada: no se pagina). Los no disponibles se incluyen marcados. */
export async function listProducts(prisma: PrismaClient, query: unknown) {
  const filters = productsQuerySchema.parse(query);
  const rows = await prisma.product.findMany({
    where: {
      ...visibleProduct,
      ...(filters.category
        ? { category: { slug: filters.category, active: true, deletedAt: null } }
        : {}),
      ...(filters.popular ? { popular: filters.popular === "true" } : {}),
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    include: productInclude,
  });
  return rows.map(productView);
}

/** Un producto por su identificador o su slug. */
export async function getProduct(prisma: PrismaClient, idOrSlug: string) {
  const where = z.uuid().safeParse(idOrSlug).success ? { id: idOrSlug } : { slug: idOrSlug };
  const row = await prisma.product.findFirst({
    where: { ...visibleProduct, ...where },
    include: productInclude,
  });
  if (!row) throw notFound("Product not found");
  return productView(row);
}
