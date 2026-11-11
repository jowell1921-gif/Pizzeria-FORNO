import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    // Cobertura del código de la web (npm run test:coverage). Las páginas de `src/app` solo componen
    // componentes ya cubiertos y se comprueban con las pruebas de navegador.
    coverage: {
      provider: "v8",
      include: ["src/features/**", "src/lib/**", "src/components/**"],
      exclude: ["src/**/*.d.ts", "src/components/ui/**"],
      reporter: ["text-summary", "json-summary", "html"],
    },
  },
});
