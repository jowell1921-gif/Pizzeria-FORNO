import { randomUUID } from "node:crypto";

import { HttpError } from "../../errors.js";

/** Almacén de imágenes. En producción es Supabase Storage; en las pruebas, uno falso. */
export interface ImageStorage {
  /** Sube la imagen y devuelve su URL pública. */
  upload(file: { bytes: Buffer; contentType: string; extension: string }): Promise<string>;
}

interface SupabaseStorageOptions {
  /** URL del proyecto (https://<ref>.supabase.co). */
  url: string;
  /** Clave secreta de Supabase: solo vive en el servidor, nunca en el navegador ni en Flutter. */
  secretKey: string;
  bucket: string;
}

export function createSupabaseStorage(options: SupabaseStorageOptions): ImageStorage {
  return {
    async upload({ bytes, contentType, extension }) {
      const path = `products/${randomUUID()}.${extension}`;
      const response = await fetch(`${options.url}/storage/v1/object/${options.bucket}/${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.secretKey}`,
          apikey: options.secretKey,
          "Content-Type": contentType,
          "x-upsert": "false",
          "Cache-Control": "max-age=31536000",
        },
        body: new Uint8Array(bytes),
      });
      if (!response.ok) {
        throw new HttpError(502, "STORAGE_ERROR", "The image could not be stored");
      }
      return `${options.url}/storage/v1/object/public/${options.bucket}/${path}`;
    },
  };
}

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Comprueba que los bytes son de verdad una imagen JPEG, PNG o WebP (no se fía del tipo que declara
 * el cliente) y devuelve su tipo y extensión.
 */
export function sniffImage(bytes: Buffer): { contentType: string; extension: string } | null {
  if (bytes.length < 13) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { contentType: "image/png", extension: "png" };
  }
  if (
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { contentType: "image/webp", extension: "webp" };
  }
  return null;
}
