import { defineConfig } from "vitest/config";

// Pruebas unitarias y de API: no necesitan base de datos. Las de base de datos están en
// tests/db y se ejecutan con `npm run test:db` (ver vitest.db.config.ts).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    exclude: ["tests/db/**", "tests/api/**", "node_modules/**"],
    coverage: { provider: "v8", reporter: ["text", "html"] },
  },
});
