import { Router } from "express";

import { requirePermission } from "../../auth/authenticate.js";
import type { PrismaClient } from "../../db/client.js";
import { unauthorized } from "../../errors.js";
import {
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  getAdminProduct,
  listAdminCategories,
  listAdminProducts,
  listAllergens,
  restoreProduct,
  updateCategory,
  updateProduct,
} from "./catalog-admin.service.js";

/** Gestión de la carta (categorías, productos, opciones, alérgenos). Permiso `catalog:manage`. */
export function createCatalogAdminRouter(prisma: PrismaClient): Router {
  const router = Router();
  const guard = requirePermission("catalog:manage");
  const actor = (req: { auth?: { userId: string } }) => {
    if (!req.auth) throw unauthorized();
    return req.auth.userId;
  };
  const id = (value: unknown) => String(value);

  router.get("/categories", guard, async (_req, res) => {
    res.json({ data: await listAdminCategories(prisma) });
  });
  router.post("/categories", guard, async (req, res) => {
    res.status(201).json({ data: await createCategory(prisma, actor(req), req.body) });
  });
  router.patch("/categories/:id", guard, async (req, res) => {
    res.json({ data: await updateCategory(prisma, actor(req), id(req.params["id"]), req.body) });
  });
  router.delete("/categories/:id", guard, async (req, res) => {
    await deleteCategory(prisma, actor(req), id(req.params["id"]));
    res.status(204).end();
  });

  router.get("/allergens", guard, async (_req, res) => {
    res.json({ data: await listAllergens(prisma) });
  });

  router.get("/products", guard, async (req, res) => {
    res.json({ data: await listAdminProducts(prisma, req.query) });
  });
  router.post("/products", guard, async (req, res) => {
    res.status(201).json({ data: await createProduct(prisma, actor(req), req.body) });
  });
  router.get("/products/:id", guard, async (req, res) => {
    res.json({ data: await getAdminProduct(prisma, id(req.params["id"])) });
  });
  router.patch("/products/:id", guard, async (req, res) => {
    res.json({ data: await updateProduct(prisma, actor(req), id(req.params["id"]), req.body) });
  });
  router.delete("/products/:id", guard, async (req, res) => {
    await deleteProduct(prisma, actor(req), id(req.params["id"]));
    res.status(204).end();
  });
  router.post("/products/:id/restore", guard, async (req, res) => {
    res.json({ data: await restoreProduct(prisma, actor(req), id(req.params["id"])) });
  });

  return router;
}
