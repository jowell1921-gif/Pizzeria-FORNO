import { describe, expect, it } from "vitest";

import {
  CUSTOMER_PERMISSIONS,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
  permissionsFor,
} from "../../src/auth/permissions.js";

describe("permission matrix", () => {
  it("gives a customer (no role) only their own data", () => {
    expect(permissionsFor([])).toEqual([...CUSTOMER_PERMISSIONS].sort());
    for (const permission of [
      "orders:read:all",
      "orders:update-status",
      "kitchen:orders:read",
      "dashboard:read",
      "catalog:manage",
      "roles:manage",
      "payments:read",
    ] as const) {
      expect(hasPermission([], permission), permission).toBe(false);
    }
  });

  it("lets the kitchen see and update orders, and nothing about customers, payments or administration", () => {
    expect(hasPermission(["KITCHEN"], "kitchen:orders:read")).toBe(true);
    expect(hasPermission(["KITCHEN"], "kitchen:orders:update-status")).toBe(true);
    for (const permission of [
      "orders:read:all",
      "customers:read",
      "payments:read",
      "dashboard:read",
      "catalog:manage",
      "promotions:manage",
      "loyalty:manage",
      "settings:manage",
      "audit:read",
      "roles:manage",
    ] as const) {
      expect(hasPermission(["KITCHEN"], permission), permission).toBe(false);
    }
  });

  it("lets staff manage orders but not the catalog, settings, loyalty or roles", () => {
    expect(hasPermission(["STAFF"], "orders:read:all")).toBe(true);
    expect(hasPermission(["STAFF"], "orders:update-status")).toBe(true);
    expect(hasPermission(["STAFF"], "dashboard:read")).toBe(true);
    for (const permission of [
      "catalog:manage",
      "promotions:manage",
      "loyalty:manage",
      "settings:manage",
      "audit:read",
      "roles:manage",
    ] as const) {
      expect(hasPermission(["STAFF"], permission), permission).toBe(false);
    }
  });

  it("lets an administrator do everything", () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission(["ADMIN"], permission), permission).toBe(true);
    }
  });

  it("combines roles without duplicates", () => {
    const combined = permissionsFor(["STAFF", "KITCHEN"]);
    expect(new Set(combined).size).toBe(combined.length);
    expect(combined).toContain("kitchen:orders:read");
    expect(combined).toContain("orders:read:all");
  });

  it("keeps every role permission inside the declared permission list", () => {
    for (const permissions of Object.values(ROLE_PERMISSIONS)) {
      for (const permission of permissions) expect(PERMISSIONS).toContain(permission);
    }
  });
});
