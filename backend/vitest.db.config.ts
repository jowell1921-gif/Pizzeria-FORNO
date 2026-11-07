import { defineConfig } from "vitest/config";

// Pruebas de integridad de la base de datos. Requieren PostgreSQL (docker compose up -d) y se
// ejecutan siempre contra la base de pruebas (DATABASE_URL_TEST, por defecto forno_test).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts", "tests/api/**/*.test.ts"],
    globalSetup: ["tests/db/global-setup.ts"],
    // Todos los archivos comparten una misma base de datos: se ejecutan uno tras otro.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
