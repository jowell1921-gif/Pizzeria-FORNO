import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".json", ".mjs", ".mts", ".md"]);
const SKIP = new Set(["node_modules", ".next", "test-results", "playwright-report", "coverage"]);

function collect(directory: string, recursive: boolean): string[] {
  return readdirSync(directory).flatMap((entry) => {
    if (SKIP.has(entry) || entry === "package-lock.json") return [];
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return recursive ? collect(path, true) : [];
    return TEXT_EXTENSIONS.has(extname(path)) || entry.startsWith(".env") ? [path] : [];
  });
}

const files = [...collect("src", true), ...collect("tests", true), ...collect(".", false)];

// Los caracteres con códigos 0xC2 y 0xC3 aparecen cuando texto UTF-8 se lee como ANSI
// ("mojibake"). No se usan en español, así que su presencia indica un archivo corrupto.
const MOJIBAKE_LEADS = new Set([0xc2, 0xc3]);

function hasMojibake(text: string): boolean {
  return Array.from(text).some((char) => MOJIBAKE_LEADS.has(char.charCodeAt(0)));
}

describe("source files encoding", () => {
  it("finds files to check", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files)("%s is clean UTF-8 without BOM", (file) => {
    const bytes = readFileSync(file);
    expect(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), "has BOM").toBe(false);
    expect(hasMojibake(bytes.toString("utf8")), "contains mojibake").toBe(false);
  });
});
