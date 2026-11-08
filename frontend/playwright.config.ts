import { defineConfig, devices } from "@playwright/test";

import { E2E_DATABASE_URL } from "./tests/e2e/global-setup";

const PORT = 3100;
const API_PORT = 4100;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    // Estado estático por defecto; las animaciones se prueban en animations.spec.ts.
    reducedMotion: "reduce",
  },
  projects: [
    {
      name: "mobile-320",
      use: { ...devices["Pixel 7"], viewport: { width: 320, height: 640 } },
    },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
    {
      name: "tablet",
      use: { ...devices["Desktop Chrome"], viewport: { width: 820, height: 1180 }, hasTouch: true },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } },
    },
  ],
  webServer: [
    {
      // API real contra la base de datos de pruebas, con los datos de demostración.
      command: "npx tsx src/server.ts",
      cwd: "../backend",
      url: `http://localhost:${API_PORT}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        NODE_ENV: "test",
        PORT: String(API_PORT),
        LOG_LEVEL: "silent",
        DATABASE_URL: E2E_DATABASE_URL,
        CORS_ORIGINS: `http://localhost:${PORT}`,
        // Solo se usa para verificar tokens: estas pruebas no inician sesión.
        SUPABASE_URL: "https://e2e-placeholder.supabase.co",
      },
    },
    {
      command: `npm run build && npm run start -- --port ${PORT}`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      // Las pruebas no dependen de la configuración local: se ejecutan sin claves de Supabase.
      // (Los flujos reales de acceso se verifican aparte, con un proyecto de Supabase configurado.)
      env: {
        NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}/api/v1`,
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      },
    },
  ],
});
