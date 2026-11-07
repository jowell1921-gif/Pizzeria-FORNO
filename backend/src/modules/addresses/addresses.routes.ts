import { Router } from "express";

import { requirePermission } from "../../auth/authenticate.js";
import type { PrismaClient } from "../../db/client.js";
import { unauthorized } from "../../errors.js";
import {
  createAddress,
  createAddressSchema,
  deleteAddress,
  listAddresses,
  updateAddress,
  updateAddressSchema,
} from "./addresses.service.js";

/** Direcciones guardadas del usuario autenticado. Montar detrás de `authenticate`. */
export function createAddressesRouter(prisma: PrismaClient): Router {
  const router = Router();
  const guard = requirePermission("addresses:manage:own");

  router.get("/", guard, async (req, res) => {
    if (!req.auth) throw unauthorized();
    res.json({ data: await listAddresses(prisma, req.auth.userId) });
  });

  router.post("/", guard, async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = createAddressSchema.parse(req.body);
    res.status(201).json({ data: await createAddress(prisma, req.auth.userId, input) });
  });

  router.patch("/:id", guard, async (req, res) => {
    if (!req.auth) throw unauthorized();
    const input = updateAddressSchema.parse(req.body);
    res.json({
      data: await updateAddress(prisma, req.auth.userId, String(req.params["id"]), input),
    });
  });

  router.delete("/:id", guard, async (req, res) => {
    if (!req.auth) throw unauthorized();
    await deleteAddress(prisma, req.auth.userId, String(req.params["id"]));
    res.status(204).end();
  });

  return router;
}
