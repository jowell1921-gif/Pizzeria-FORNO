import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/** Base de datos de pruebas (la misma que usan las pruebas del backend; nunca desarrollo ni producción). */
export const E2E_DATABASE_URL =
  process.env["DATABASE_URL_TEST"] ??
  "postgresql://forno:forno_dev_password@localhost:5432/forno_test";

/**
 * Antes de las pruebas de navegador: aplica las migraciones a la base de pruebas y siembra los
 * datos de demostración (idempotente), para que la API real tenga carta, promociones y zonas.
 * Requiere PostgreSQL local (docker compose up -d).
 */
export default function setup(): void {
  if (!/_test(\?|$)/.test(E2E_DATABASE_URL)) {
    throw new Error("E2E tests only run against a database whose name ends in _test");
  }
  const cwd = resolve(__dirname, "../../../backend");
  const env = { ...process.env, DATABASE_URL: E2E_DATABASE_URL };
  for (const args of [
    ["prisma", "migrate", "deploy"],
    ["prisma", "db", "seed"],
  ]) {
    execFileSync("npx", args, { cwd, env, stdio: "pipe", shell: process.platform === "win32" });
  }
}
