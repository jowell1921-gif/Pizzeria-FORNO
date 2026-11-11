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
    // Cobertura de todo el código del servidor con las pruebas de base de datos y de API
    // (npm run test:coverage). El código generado de Prisma y el arranque no cuentan.
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/generated/**", "src/server.ts", "src/**/*.d.ts"],
      reporter: ["text-summary", "json-summary", "html"],
    },
  },
});
