import { Router } from "express";

import type { PrismaClient } from "../../db/client.js";
import { publicCache } from "../../middleware/cache.js";
import { getProduct, listCategories, listProducts } from "./catalog.service.js";

/** Carta pública: categorías y productos. No requiere autenticación. */
export function createCatalogRouter(prisma: PrismaClient): Router {
  const router = Router();
  router.use(publicCache());

  router.get("/categories", async (_req, res) => {
    res.json({ data: await listCategories(prisma) });
  });

  router.get("/products", async (req, res) => {
    res.json({ data: await listProducts(prisma, req.query) });
  });

  router.get("/products/:idOrSlug", async (req, res) => {
    res.json({ data: await getProduct(prisma, req.params.idOrSlug) });
  });

  return router;
}
