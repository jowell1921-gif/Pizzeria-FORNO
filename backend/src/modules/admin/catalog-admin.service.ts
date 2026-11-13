import { z } from "zod";

import type { Prisma, PrismaClient } from "../../db/client.js";
import { conflict, HttpError, notFound } from "../../errors.js";
import { recordAudit } from "../../utils/audit.js";
import { slugify, uniqueSlug } from "../../utils/slug.js";

const money = (value: Prisma.Decimal) => value.toFixed(2);
const uuid = z.uuid();

/** Importe decimal con IVA incluido, como cadena («9.50»). Nunca un número de coma flotante. */
const price = z.string().regex(/^\d{1,6}(\.\d{1,2})?$/, "Invalid amount");
const delta = z.string().regex(/^-?\d{1,6}(\.\d{1,2})?$/, "Invalid amount");

/** Ruta del propio sitio («/image/…») o URL https; nunca otros esquemas ni rutas relativas con «..». */
const imageUrl = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine(
    (value) =>
      (/^\/[A-Za-z0-9_./-]+$/.test(value) && !value.includes("..")) ||
      /^https:\/\/\S+$/.test(value),
    "Invalid image URL",
  );

const optionSchema = z
  .object({
    id: uuid.optional(),
    name: z.string().trim().min(1).max(80),
    priceDelta: delta.default("0.00"),
    isDefault: z.boolean().default(false),
    available: z.boolean().default(true),
  })
  .strict();

const groupSchema = z
  .object({
    id: uuid.optional(),
    name: z.string().trim().min(1).max(80),
    kind: z.enum(["SIZE", "DOUGH", "EXTRA_INGREDIENT", "EXTRA"]),
    required: z.boolean().default(false),
    minSelect: z.number().int().min(0).max(10).default(0),
    maxSelect: z.number().int().min(1).max(30).default(1),
    options: z.array(optionSchema).min(1).max(40),
  })
  .strict()
  .superRefine((group, ctx) => {
    const issue = (message: string, path: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (group.required && group.minSelect < 1)
      issue("A required group needs minSelect >= 1", "minSelect");
    if (group.maxSelect < group.minSelect) issue("maxSelect must be >= minSelect", "maxSelect");
    if (group.options.length < group.minSelect)
      issue("Not enough options for minSelect", "options");
    const defaults = group.options.filter((option) => option.isDefault).length;
    if (group.maxSelect === 1 && defaults > 1)
      issue("Only one default option is allowed", "options");
    if (defaults > group.maxSelect) issue("Too many default options", "options");
  });

export const productInputSchema = z
  .object({
    categoryId: uuid,
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().min(1).max(400),
    basePrice: price,
    taxRate: z
      .string()
      .regex(/^\d{1,2}(\.\d{1,2})?$|^100(\.0{1,2})?$/)
      .optional(),
    vegetarian: z.boolean().optional(),
    available: z.boolean().optional(),
    popular: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(100_000).optional(),
    ingredients: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
    /** Códigos de alérgeno (por ejemplo «gluten»), ver `GET /admin/allergens`. */
    allergens: z.array(z.string().trim().min(1).max(30)).max(14).optional(),
    image: z
      .object({ url: imageUrl, alt: z.string().trim().max(120).default("") })
      .strict()
      .nullable()
      .optional(),
    optionGroups: z.array(groupSchema).max(10).optional(),
  })
  .strict();

export const productPatchSchema = productInputSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export type ProductInput = z.infer<typeof productInputSchema>;

export const categoryInputSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    description: z.string().trim().max(200).nullable().optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
    active: z.boolean().optional(),
  })
  .strict();

export const categoryPatchSchema = categoryInputSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

const productInclude = {
  category: { select: { name: true } },
  images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
  ingredients: { orderBy: { position: "asc" }, include: { ingredient: true } },
  allergens: { include: { allergen: true } },
  optionGroups: {
    orderBy: { sortOrder: "asc" },
    include: { options: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } } },
  },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

function productView(product: ProductRow) {
  const image = product.images[0];
  return {
    id: product.id,
    slug: product.slug,
    categoryId: product.categoryId,
    categoryName: product.category.name,
    name: product.name,
    description: product.description,
    basePrice: money(product.basePrice),
    taxRate: money(product.taxRate),
    vegetarian: product.vegetarian,
    available: product.available,
    popular: product.popular,
    sortOrder: product.sortOrder,
    deleted: product.deletedAt !== null,
    image: image ? { url: image.url, alt: image.alt } : null,
    ingredients: product.ingredients.map((row) => row.ingredient.name),
    allergens: product.allergens.map((row) => row.allergen.code).sort(),
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

// ───────────────────────────── Categorías ─────────────────────────────

export async function listAdminCategories(prisma: PrismaClient) {
  const rows = await prisma.category.findMany({
    where: { deletedAt: null },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: { where: { deletedAt: null } } } } },
  });
  return rows.map((category) => ({
    id: category.id,
    slug: category.slug,
    name: category.name,
    description: category.description,
    sortOrder: category.sortOrder,
    active: category.active,
    productCount: category._count.products,
  }));
}

/**
 * Crea una categoría. El identificador legible (slug) se deriva del nombre y es único; si no se
 * indica orden, va la última. Queda en la auditoría.
 */
export async function createCategory(prisma: PrismaClient, actorId: string, body: unknown) {
  const input = categoryInputSchema.parse(body);
  const id = await prisma.$transaction(async (tx) => {
    const slug = await uniqueSlug(slugify(input.name), async (candidate) =>
      Boolean(await tx.category.findUnique({ where: { slug: candidate } })),
    );
    const last = await tx.category.aggregate({ _max: { sortOrder: true } });
    const category = await tx.category.create({
      data: {
        slug,
        name: input.name,
        description: input.description ?? null,
        sortOrder: input.sortOrder ?? (last._max.sortOrder ?? -1) + 1,
        active: input.active ?? true,
      },
    });
    await recordAudit(tx, {
      actorId,
      action: "category.create",
      entityType: "Category",
      entityId: category.id,
      after: { name: category.name, active: category.active },
    });
    return category.id;
  });
  return (await listAdminCategories(prisma)).find((category) => category.id === id)!;
}

/** Modifica una categoría; solo cambian los campos enviados. Queda en la auditoría. */
export async function updateCategory(
  prisma: PrismaClient,
  actorId: string,
  id: string,
  body: unknown,
) {
  const input = categoryPatchSchema.parse(body);
  if (!uuid.safeParse(id).success) throw notFound("Category not found");
  await prisma.$transaction(async (tx) => {
    const before = await tx.category.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw notFound("Category not found");
    const after = await tx.category.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
    await recordAudit(tx, {
      actorId,
      action: "category.update",
      entityType: "Category",
      entityId: id,
      before: { name: before.name, active: before.active, sortOrder: before.sortOrder },
      after: { name: after.name, active: after.active, sortOrder: after.sortOrder },
    });
  });
  return (await listAdminCategories(prisma)).find((category) => category.id === id)!;
}

/** Borrado lógico. Una categoría con productos no se borra: primero hay que moverlos o borrarlos. */
export async function deleteCategory(prisma: PrismaClient, actorId: string, id: string) {
  if (!uuid.safeParse(id).success) throw notFound("Category not found");
  await prisma.$transaction(async (tx) => {
    const category = await tx.category.findFirst({ where: { id, deletedAt: null } });
    if (!category) throw notFound("Category not found");
    const products = await tx.product.count({ where: { categoryId: id, deletedAt: null } });
    if (products > 0) {
      throw conflict("CATEGORY_HAS_PRODUCTS", "The category still has products");
    }
    await tx.category.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await recordAudit(tx, {
      actorId,
      action: "category.delete",
      entityType: "Category",
      entityId: id,
      before: { name: category.name },
    });
  });
}

/** Los 14 alérgenos de declaración obligatoria (UE), para marcar los de cada producto. */
export async function listAllergens(prisma: PrismaClient) {
  const rows = await prisma.allergen.findMany({ orderBy: { name: "asc" } });
  return rows.map((allergen) => ({ code: allergen.code, name: allergen.name }));
}

// ───────────────────────────── Productos ─────────────────────────────

export const productsQuerySchema = z.object({
  category: uuid.optional(),
  q: z.string().trim().min(1).max(80).optional(),
  status: z.enum(["all", "available", "unavailable", "deleted"]).default("all"),
});

/**
 * Productos para el panel, filtrables por estado (disponibles, agotados, borrados o todos),
 * categoría y nombre. No pagina: la carta es pequeña.
 */
export async function listAdminProducts(prisma: PrismaClient, query: unknown) {
  const filters = productsQuerySchema.parse(query);
  const rows = await prisma.product.findMany({
    where: {
      ...(filters.status === "deleted"
        ? { deletedAt: { not: null } }
        : {
            deletedAt: null,
            ...(filters.status === "all" ? {} : { available: filters.status === "available" }),
          }),
      ...(filters.category ? { categoryId: filters.category } : {}),
      ...(filters.q ? { name: { contains: filters.q, mode: "insensitive" } } : {}),
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    include: productInclude,
  });
  return rows.map(productView);
}

/**
 * Ficha completa de un producto para editarlo: ingredientes, alérgenos, imagen y grupos de
 * opciones.
 */
export async function getAdminProduct(prisma: PrismaClient, id: string) {
  if (!uuid.safeParse(id).success) throw notFound("Product not found");
  const row = await prisma.product.findUnique({ where: { id }, include: productInclude });
  if (!row) throw notFound("Product not found");
  return productView(row);
}

const unprocessable = (code: string, message: string, details?: unknown) =>
  new HttpError(422, code, message, details);

async function writeRelations(
  tx: Prisma.TransactionClient,
  productId: string,
  input: Partial<ProductInput>,
) {
  if (input.ingredients !== undefined) {
    await tx.productIngredient.deleteMany({ where: { productId } });
    const names = [...new Set(input.ingredients.map((name) => name.trim()))];
    for (const [position, name] of names.entries()) {
      const ingredient = await tx.ingredient.upsert({
        where: { name },
        update: {},
        create: { name },
      });
      await tx.productIngredient.create({
        data: { productId, ingredientId: ingredient.id, position },
      });
    }
  }

  if (input.allergens !== undefined) {
    const codes = [...new Set(input.allergens)];
    const found = await tx.allergen.findMany({ where: { code: { in: codes } } });
    if (found.length !== codes.length) {
      throw unprocessable("UNKNOWN_ALLERGEN", "An allergen code does not exist");
    }
    await tx.productAllergen.deleteMany({ where: { productId } });
    for (const allergen of found) {
      await tx.productAllergen.create({ data: { productId, allergenId: allergen.id } });
    }
  }

  if (input.image !== undefined) {
    await tx.productImage.deleteMany({ where: { productId } });
    if (input.image) {
      await tx.productImage.create({
        data: { productId, url: input.image.url, alt: input.image.alt, isPrimary: true },
      });
    }
  }

  if (input.optionGroups !== undefined) {
    await syncOptionGroups(tx, productId, input.optionGroups);
  }
}

/**
 * Sustituye los grupos de opciones del producto conservando los identificadores de los que ya
 * existen (los carritos guardados siguen apuntando a ellos). Lo que no viene en la petición se
 * elimina: los grupos se borran y las opciones se marcan como borradas.
 */
async function syncOptionGroups(
  tx: Prisma.TransactionClient,
  productId: string,
  groups: z.infer<typeof groupSchema>[],
) {
  const existing = await tx.optionGroup.findMany({
    where: { productId },
    include: { options: { where: { deletedAt: null } } },
  });
  const existingGroups = new Map(existing.map((group) => [group.id, group]));
  const keptGroups = new Set<string>();

  for (const [groupIndex, group] of groups.entries()) {
    if (group.id && !existingGroups.has(group.id)) {
      throw unprocessable(
        "INVALID_OPTION_GROUP",
        "An option group does not belong to this product",
      );
    }
    const data = {
      name: group.name,
      kind: group.kind,
      required: group.required,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      sortOrder: groupIndex,
    };
    const saved = group.id
      ? await tx.optionGroup.update({ where: { id: group.id }, data })
      : await tx.optionGroup.create({ data: { productId, ...data } });
    keptGroups.add(saved.id);

    const currentOptions = new Map(
      (existingGroups.get(saved.id)?.options ?? []).map((option) => [option.id, option]),
    );
    const keptOptions = new Set<string>();
    for (const [optionIndex, option] of group.options.entries()) {
      if (option.id && !currentOptions.has(option.id)) {
        throw unprocessable("INVALID_OPTION", "An option does not belong to this group");
      }
      const optionData = {
        name: option.name,
        priceDelta: option.priceDelta,
        isDefault: option.isDefault,
        available: option.available,
        sortOrder: optionIndex,
      };
      const savedOption = option.id
        ? await tx.productOption.update({ where: { id: option.id }, data: optionData })
        : await tx.productOption.create({ data: { groupId: saved.id, ...optionData } });
      keptOptions.add(savedOption.id);
    }
    const removed = [...currentOptions.keys()].filter((id) => !keptOptions.has(id));
    if (removed.length > 0) {
      await tx.productOption.updateMany({
        where: { id: { in: removed } },
        data: { deletedAt: new Date(), isDefault: false },
      });
    }
  }

  const removedGroups = existing
    .filter((group) => !keptGroups.has(group.id))
    .map((group) => group.id);
  if (removedGroups.length > 0)
    await tx.optionGroup.deleteMany({ where: { id: { in: removedGroups } } });
}

async function assertCategory(tx: Prisma.TransactionClient, categoryId: string) {
  const category = await tx.category.findFirst({ where: { id: categoryId, deletedAt: null } });
  if (!category) throw unprocessable("CATEGORY_NOT_FOUND", "The category does not exist");
}

const summary = (product: {
  name: string;
  basePrice: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  available: boolean;
  categoryId: string;
}) => ({
  name: product.name,
  basePrice: money(product.basePrice),
  taxRate: money(product.taxRate),
  available: product.available,
  categoryId: product.categoryId,
});

/**
 * Crea un producto con su imagen, ingredientes, alérgenos y opciones en una sola transacción: o se
 * guarda todo o nada.
 */
export async function createProduct(prisma: PrismaClient, actorId: string, body: unknown) {
  const input = productInputSchema.parse(body);
  const id = await prisma.$transaction(async (tx) => {
    await assertCategory(tx, input.categoryId);
    const slug = await uniqueSlug(slugify(input.name), async (candidate) =>
      Boolean(await tx.product.findUnique({ where: { slug: candidate } })),
    );
    const last = await tx.product.aggregate({
      where: { categoryId: input.categoryId },
      _max: { sortOrder: true },
    });
    const product = await tx.product.create({
      data: {
        categoryId: input.categoryId,
        slug,
        name: input.name,
        description: input.description,
        basePrice: input.basePrice,
        taxRate: input.taxRate ?? "10.00",
        vegetarian: input.vegetarian ?? false,
        available: input.available ?? true,
        popular: input.popular ?? false,
        sortOrder: input.sortOrder ?? (last._max.sortOrder ?? -1) + 1,
      },
    });
    await writeRelations(tx, product.id, input);
    await recordAudit(tx, {
      actorId,
      action: "product.create",
      entityType: "Product",
      entityId: product.id,
      after: summary(product),
    });
    return product.id;
  });
  return getAdminProduct(prisma, id);
}

/**
 * Modifica un producto; solo cambian los campos enviados. Los pedidos ya hechos no cambian porque
 * guardan una copia.
 */
export async function updateProduct(
  prisma: PrismaClient,
  actorId: string,
  id: string,
  body: unknown,
) {
  const input = productPatchSchema.parse(body);
  if (!uuid.safeParse(id).success) throw notFound("Product not found");
  await prisma.$transaction(async (tx) => {
    const before = await tx.product.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw notFound("Product not found");
    if (input.categoryId) await assertCategory(tx, input.categoryId);

    const after = await tx.product.update({
      where: { id },
      data: {
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.basePrice !== undefined ? { basePrice: input.basePrice } : {}),
        ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
        ...(input.vegetarian !== undefined ? { vegetarian: input.vegetarian } : {}),
        ...(input.available !== undefined ? { available: input.available } : {}),
        ...(input.popular !== undefined ? { popular: input.popular } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
    await writeRelations(tx, id, input);
    await recordAudit(tx, {
      actorId,
      action: "product.update",
      entityType: "Product",
      entityId: id,
      before: summary(before),
      after: { ...summary(after), changed: Object.keys(input) },
    });
  });
  return getAdminProduct(prisma, id);
}

/** Borrado lógico: el producto desaparece de la carta, pero los pedidos antiguos lo conservan. */
export async function deleteProduct(prisma: PrismaClient, actorId: string, id: string) {
  if (!uuid.safeParse(id).success) throw notFound("Product not found");
  await prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({ where: { id, deletedAt: null } });
    if (!product) throw notFound("Product not found");
    await tx.product.update({ where: { id }, data: { deletedAt: new Date(), available: false } });
    // Los carritos guardados dejan de incluirlo.
    await tx.cartItem.deleteMany({ where: { productId: id } });
    await recordAudit(tx, {
      actorId,
      action: "product.delete",
      entityType: "Product",
      entityId: id,
      before: summary(product),
    });
  });
}

/**
 * Recupera un producto borrado. El borrado es lógico: se conserva para el historial de pedidos.
 * Falla si su categoría ya no existe.
 */
export async function restoreProduct(prisma: PrismaClient, actorId: string, id: string) {
  if (!uuid.safeParse(id).success) throw notFound("Product not found");
  await prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({ where: { id, deletedAt: { not: null } } });
    if (!product) throw notFound("Product not found");
    await assertCategory(tx, product.categoryId);
    await tx.product.update({ where: { id }, data: { deletedAt: null } });
    await recordAudit(tx, {
      actorId,
      action: "product.restore",
      entityType: "Product",
      entityId: id,
      after: { name: product.name },
    });
  });
  return getAdminProduct(prisma, id);
}
