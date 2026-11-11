import { defineConfig, devices } from "@playwright/test";

import { E2E_DATABASE_URL } from "./tests/e2e/global-setup";

/**
 * Pruebas de navegador del panel del personal, la cocina y «Mi cuenta» CON sesión (npm run
 * test:e2e:panel). Usan la API real, la web real y una base de datos *_test; lo único simulado es
 * Supabase Auth, sustituido por un servidor local que publica un JWKS y firma tokens
 * (backend/tests/e2e-support/fake-supabase.ts). Todo el código de verificación es el de producción.
 */
const WEB = 3200;
const API = 4200;
const AUTH = 4300;
const DIST = ".next-panel";

export default defineConfig({
  testDir: "./tests/e2e-panel",
  globalSetup: "./tests/e2e-panel/global-setup.ts",
  // Todos comparten la misma base de datos y datos de prueba: se ejecutan de uno en uno.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${WEB}`, trace: "on-first-retry", reducedMotion: "reduce" },
  projects: [
    { name: "mobile-320", use: { ...devices["Pixel 7"], viewport: { width: 320, height: 640 } } },
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
      command: "npx tsx tests/e2e-support/fake-supabase.ts",
      cwd: "../backend",
      url: `http://localhost:${AUTH}/health`,
      reuseExistingServer: !process.env.CI,
      env: { PORT: String(AUTH) },
    },
    {
      command: "npx tsx src/server.ts",
      cwd: "../backend",
      url: `http://localhost:${API}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        NODE_ENV: "test",
        PORT: String(API),
        LOG_LEVEL: "silent",
        DATABASE_URL: E2E_DATABASE_URL,
        CORS_ORIGINS: `http://localhost:${WEB}`,
        SUPABASE_URL: `http://localhost:${AUTH}`,
        SELF_ADMIN_ENABLED: "false",
      },
    },
    {
      command: `npm run build && npm run start -- --port ${WEB}`,
      url: `http://localhost:${WEB}`,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      env: {
        NEXT_DIST_DIR: DIST,
        NEXT_PUBLIC_API_URL: `http://localhost:${API}/api/v1`,
        NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${AUTH}`,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e_placeholder_key",
      },
    },
  ],
});
