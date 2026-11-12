import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { DIAGRAM_FILE, buildDiagram } from "../scripts/export-schema-diagram.js";

/**
 * La documentación entregada a otros equipos (Flutter) no puede quedarse atrás: estas pruebas fallan
 * si el código y los documentos se separan.
 */
const SRC = resolve(import.meta.dirname, "../src");
const ERRORS_DOC = resolve(import.meta.dirname, "../../docs/flutter/errores.md");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === "generated" ? [] : sourceFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

describe("database diagram (docs/database/diagrama.md)", () => {
  it("matches the Prisma schema", () => {
    // Si falla: ejecuta `npm run docs:schema` en backend/ y sube el archivo actualizado.
    expect(readFileSync(DIAGRAM_FILE, "utf8")).toBe(buildDiagram());
  });

  it("draws every table and its relations", () => {
    const diagram = buildDiagram();
    for (const table of [
      "Profile",
      "Order",
      "OrderItem",
      "Payment",
      "Invoice",
      "LoyaltyTransaction",
      "NotificationLog",
    ]) {
      expect(diagram, table).toContain(`  ${table} {`);
    }
    expect(diagram).toContain('Profile ||--o{ Order : "userId"');
  });
});

describe("error catalog (docs/flutter/errores.md)", () => {
  /** Códigos que el servidor puede devolver: los que lanzan las funciones de error y el manejador central. */
  function thrownCodes(): Set<string> {
    const codes = new Set([
      "VALIDATION_ERROR",
      "INVALID_JSON",
      "PAYLOAD_TOO_LARGE",
      "INTERNAL_ERROR",
      "FORBIDDEN",
      "TOKEN_EXPIRED",
      "INVALID_TOKEN",
    ]);
    const pattern =
      /(?:HttpError\(\s*\d{3},\s*|\b(?:conflict|forbidden|unauthorized|rejected|unprocessable|invalid|failure)\(\s*)"([A-Z][A-Z_]+)"/g;
    for (const file of sourceFiles(SRC)) {
      for (const match of readFileSync(file, "utf8").matchAll(pattern)) codes.add(match[1]!);
    }
    return codes;
  }

  it("documents every code the server can return, and nothing that no longer exists", () => {
    const documented = new Set(
      [...readFileSync(ERRORS_DOC, "utf8").matchAll(/^\| `([A-Z][A-Z_]+)`\s*\|/gm)].map(
        (match) => match[1]!,
      ),
    );
    const thrown = thrownCodes();
    expect([...thrown].filter((code) => !documented.has(code)).sort()).toEqual([]);
    expect([...documented].filter((code) => !thrown.has(code)).sort()).toEqual([]);
    expect(thrown.size).toBeGreaterThan(70);
  });
});
