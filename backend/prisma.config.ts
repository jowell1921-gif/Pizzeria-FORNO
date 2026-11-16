import { defineConfig } from "prisma/config";

// En desarrollo, las variables salen del archivo .env. Se carga con la función incluida en Node (sin el
// paquete «dotenv», que es solo de desarrollo y no está en la instalación de producción de Railway: con
// él, `prisma generate` fallaba al compilar). En producción no hay .env: las variables ya vienen del
// entorno, y por eso un archivo ausente no es un error.
try {
  process.loadEnvFile();
} catch {
  // Sin .env.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
