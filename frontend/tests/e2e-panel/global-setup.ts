import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { E2E_DATABASE_URL } from "../e2e/global-setup";

/** Migra la base *_test y la rellena con usuarios y pedidos de prueba (ver seed-panel.ts). */
export default function setup(): void {
  if (!/_test(\?|$)/.test(E2E_DATABASE_URL)) {
    throw new Error("E2E tests only run against a database whose name ends in _test");
  }
  const cwd = resolve(__dirname, "../../../backend");
  const env = { ...process.env, DATABASE_URL: E2E_DATABASE_URL };
  const run = (args: string[]) =>
    execFileSync("npx", args, { cwd, env, stdio: "pipe", shell: process.platform === "win32" });
  run(["prisma", "migrate", "deploy"]);
  run(["tsx", "tests/e2e-support/seed-panel.ts"]);
}
