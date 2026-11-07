import { execFileSync } from "node:child_process";

import pg from "pg";

import { getTestDatabaseUrl } from "./test-database.js";

/**
 * Antes de las pruebas: vacía el esquema de la base de pruebas y aplica TODAS las migraciones
 * desde cero. Así cada ejecución comprueba también que las migraciones se aplican sobre una base
 * vacía.
 */
export default async function setup(): Promise<void> {
  const url = getTestDatabaseUrl();

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
  } finally {
    await client.end();
  }

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
    shell: process.platform === "win32",
  });
}
