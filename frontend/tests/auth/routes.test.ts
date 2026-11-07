import { describe, expect, it } from "vitest";

import { isProtectedPath, loginUrlFor, safeNextPath } from "@/features/auth/routes";

describe("safeNextPath (open redirect protection)", () => {
  it("keeps internal paths, with their query string and hash", () => {
    expect(safeNextPath("/cuenta")).toBe("/cuenta");
    expect(safeNextPath("/carta?categoria=pizzas#postres")).toBe("/carta?categoria=pizzas#postres");
    expect(safeNextPath("/")).toBe("/");
    expect(safeNextPath("  /promociones ")).toBe("/promociones");
  });

  it("falls back to the account page when there is no destination", () => {
    expect(safeNextPath(null)).toBe("/cuenta");
    expect(safeNextPath(undefined)).toBe("/cuenta");
    expect(safeNextPath("")).toBe("/cuenta");
    expect(safeNextPath("", "/")).toBe("/");
  });

  it.each([
    "https://evil.example",
    "http://evil.example/cuenta",
    "//evil.example",
    "//evil.example/cuenta",
    "/\\evil.example",
    "\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "evil.example",
    "cuenta",
    "/ok\\@evil.example",
    "/ok\nHost: evil.example",
    "/ok\r\nSet-Cookie: x=1",
    "/\u0000evil",
  ])("rejects the external or malformed destination %j", (value) => {
    expect(safeNextPath(value)).toBe("/cuenta");
  });
});

describe("protected routes", () => {
  it("protects the account, the admin panel and the kitchen screen (and their subpaths)", () => {
    for (const path of ["/cuenta", "/cuenta/pedidos", "/admin", "/admin/productos", "/kitchen"]) {
      expect(isProtectedPath(path), path).toBe(true);
    }
  });

  it("does not protect public pages or look-alike paths", () => {
    for (const path of [
      "/",
      "/carta",
      "/promociones",
      "/acceso",
      "/cuentas",
      "/administracion",
      "/kitchenette",
    ]) {
      expect(isProtectedPath(path), path).toBe(false);
    }
  });

  it("builds the login URL with an encoded destination", () => {
    expect(loginUrlFor("/cuenta")).toBe("/acceso?next=%2Fcuenta");
    expect(loginUrlFor("/admin?x=1&y=2")).toBe("/acceso?next=%2Fadmin%3Fx%3D1%26y%3D2");
  });
});
