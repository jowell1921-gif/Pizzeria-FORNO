import express, { Router } from "express";

import { requirePermission } from "../../auth/authenticate.js";
import type { PrismaClient } from "../../db/client.js";
import { HttpError, unauthorized } from "../../errors.js";
import { recordAudit } from "../../utils/audit.js";
import { MAX_IMAGE_BYTES, sniffImage, type ImageStorage } from "./storage.js";

/**
 * Subida de fotos de producto. Permiso `catalog:manage`. El cuerpo es la imagen en bruto
 * (`Content-Type: image/jpeg | image/png | image/webp`, máximo 3 MB); se comprueban los bytes, no
 * el tipo declarado. Sin almacenamiento configurado responde 503 y el producto sigue pudiendo usar
 * la ruta o URL de una imagen.
 */
export function createUploadsRouter(
  prisma: PrismaClient,
  storage: ImageStorage | undefined,
): Router {
  const router = Router();

  router.post(
    "/uploads/product-image",
    requirePermission("catalog:manage"),
    express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: MAX_IMAGE_BYTES }),
    async (req, res) => {
      if (!req.auth) throw unauthorized();
      if (!storage) {
        throw new HttpError(503, "STORAGE_NOT_CONFIGURED", "Image storage is not configured");
      }
      const bytes = req.body as unknown;
      if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
        throw new HttpError(
          400,
          "IMAGE_REQUIRED",
          "Send the image as the request body (JPEG, PNG or WebP)",
        );
      }
      const kind = sniffImage(bytes);
      if (!kind) {
        throw new HttpError(400, "INVALID_IMAGE", "The file is not a JPEG, PNG or WebP image");
      }

      const url = await storage.upload({ bytes, ...kind });
      await recordAudit(prisma, {
        actorId: req.auth.userId,
        action: "upload.product-image",
        entityType: "Image",
        after: { url, bytes: bytes.length, contentType: kind.contentType },
      });
      res.status(201).json({ data: { url } });
    },
  );

  return router;
}
