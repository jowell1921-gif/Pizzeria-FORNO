import { describe, expect, it } from "vitest";

import { docsEnabled, loadEnv } from "../src/config/env.js";

const required = {
  DATABASE_URL: "postgresql://forno:secret@localhost:5432/forno_dev",
  SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
};

describe("loadEnv", () => {
  it("applies defaults", () => {
    const env = loadEnv(required);
    expect(env.PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual(["http://localhost:3000"]);
  });

  it("parses a comma-separated list of origins", () => {
    const env = loadEnv({ ...required, CORS_ORIGINS: "https://a.example, https://b.example" });
    expect(env.CORS_ORIGINS).toEqual(["https://a.example", "https://b.example"]);
  });

  it("rejects an invalid port", () => {
    expect(() => loadEnv({ ...required, PORT: "abc" })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it("requires the database and Supabase URLs", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ DATABASE_URL: required.DATABASE_URL })).toThrow(/SUPABASE_URL/);
    expect(() => loadEnv({ ...required, SUPABASE_URL: "not a url" })).toThrow(/SUPABASE_URL/);
  });

  it("removes trailing slashes from the Supabase URL", () => {
    const env = loadEnv({ ...required, SUPABASE_URL: "https://abcdefghijklmnop.supabase.co//" });
    expect(env.SUPABASE_URL).toBe("https://abcdefghijklmnop.supabase.co");
  });
});

describe("loadEnv (API settings)", () => {
  it("applies safe defaults for logging, proxies and docs", () => {
    const env = loadEnv(required);
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.TRUST_PROXY).toBe(0);
    expect(env.API_DOCS_ENABLED).toBeUndefined();
  });

  it("publishes the docs everywhere except production, unless told otherwise", () => {
    expect(docsEnabled({ NODE_ENV: "development", API_DOCS_ENABLED: undefined })).toBe(true);
    expect(docsEnabled({ NODE_ENV: "production", API_DOCS_ENABLED: undefined })).toBe(false);
    expect(docsEnabled({ NODE_ENV: "production", API_DOCS_ENABLED: true })).toBe(true);
    expect(docsEnabled({ NODE_ENV: "development", API_DOCS_ENABLED: false })).toBe(false);
  });

  it("parses and validates the new variables", () => {
    const env = loadEnv({
      ...required,
      TRUST_PROXY: "1",
      API_DOCS_ENABLED: "true",
      LOG_LEVEL: "warn",
    });
    expect(env).toMatchObject({ TRUST_PROXY: 1, API_DOCS_ENABLED: true, LOG_LEVEL: "warn" });
    expect(() => loadEnv({ ...required, TRUST_PROXY: "-1" })).toThrow(/TRUST_PROXY/);
    expect(() => loadEnv({ ...required, API_DOCS_ENABLED: "yes" })).toThrow(/API_DOCS_ENABLED/);
    expect(() => loadEnv({ ...required, LOG_LEVEL: "loud" })).toThrow(/LOG_LEVEL/);
  });
});
