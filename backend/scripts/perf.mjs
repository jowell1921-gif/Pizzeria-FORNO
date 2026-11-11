import { spawn } from "node:child_process";
import console from "node:console";
import process from "node:process";

import autocannon from "autocannon";

/**
 * Mide el rendimiento de los endpoints principales con autocannon (npm run perf). Arranca la API de
 * medición (tests/e2e-support/load-server.ts) contra la base *_test, espera a que esté lista, lanza
 * 30 conexiones simultáneas contra cada endpoint y la apaga. Necesita PostgreSQL (docker compose up -d)
 * con los datos de demostración (npm run db:seed apuntando a forno_test, o haber ejecutado las pruebas).
 */
const PORT = 4400;
const DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  "postgresql://forno:forno_dev_password@localhost:5432/forno_test";

const server = spawn("npx", ["tsx", "tests/e2e-support/load-server.ts"], {
  env: { ...process.env, DATABASE_URL, PORT: String(PORT) },
  shell: process.platform === "win32",
});

let token = "";
await new Promise((resolve, reject) => {
  let output = "";
  server.stdout.on("data", (chunk) => {
    output += chunk;
    token ||= /TOKEN=(\S+)/.exec(output)?.[1] ?? "";
    if (output.includes(`READY ${PORT}`)) resolve();
  });
  server.stderr.on("data", (chunk) => process.stderr.write(chunk));
  server.on("exit", () => reject(new Error("The measurement server stopped")));
});

const base = `http://127.0.0.1:${PORT}/api/v1`;
const auth = { Authorization: `Bearer ${token}` };
const targets = [
  ["GET /products", "/products"],
  ["GET /categories", "/categories"],
  ["GET /store/settings", "/store/settings"],
  ["GET /promotions", "/promotions"],
  ["GET /store/slots", "/store/slots?type=PICKUP"],
  ["GET /orders/me (sesión)", "/orders/me", auth],
  ["GET /loyalty/account (sesión)", "/loyalty/account", auth],
];

console.log("endpoint | req/s | p50 ms | p97.5 ms | p99 ms | errores");
try {
  for (const [name, path, headers] of targets) {
    const result = await autocannon({ url: base + path, connections: 30, duration: 8, headers });
    console.log(
      [
        name,
        Math.round(result.requests.average),
        result.latency.p50,
        result.latency.p97_5,
        result.latency.p99,
        result.non2xx + result.errors + result.timeouts,
      ].join(" | "),
    );
  }
} finally {
  server.kill();
}
process.exit(0);
