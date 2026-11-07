import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { grantRole, revokeRole } from "../../src/auth/roles-service.js";
import { createTestClient, createUser, resetDatabase, type PrismaClient } from "../db/helpers.js";

let prisma: PrismaClient;

beforeAll(() => {
  prisma = createTestClient();
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
});

const change = (email: string, role: "ADMIN" | "STAFF" | "KITCHEN") => ({
  email,
  role,
  reason: "Prueba automatizada",
});

describe("role management", () => {
  it("grants a role and records it in the audit log", async () => {
    const user = await createUser(prisma, { email: "ana@example.test" });
    const result = await grantRole(prisma, change("ANA@example.test", "STAFF"));

    expect(result).toEqual({ userId: user.id, changed: true });
    expect(await prisma.userRole.count({ where: { userId: user.id, role: "STAFF" } })).toBe(1);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "role.grant" } });
    expect(log).toMatchObject({
      entityType: "UserRole",
      entityId: user.id,
      reason: "Prueba automatizada",
    });
    expect(log.after).toEqual({ roles: ["STAFF"] });
  });

  it("is idempotent: granting twice changes and logs once", async () => {
    await createUser(prisma, { email: "ana@example.test" });
    await grantRole(prisma, change("ana@example.test", "STAFF"));
    const again = await grantRole(prisma, change("ana@example.test", "STAFF"));
    expect(again.changed).toBe(false);
    expect(await prisma.auditLog.count()).toBe(1);
  });

  it("rejects users that have never signed in or are disabled", async () => {
    await expect(grantRole(prisma, change("ghost@example.test", "ADMIN"))).rejects.toMatchObject({
      status: 404,
    });
    await createUser(prisma, { email: "gone@example.test", deletedAt: new Date() });
    await expect(grantRole(prisma, change("gone@example.test", "ADMIN"))).rejects.toMatchObject({
      status: 404,
    });
    expect(await prisma.userRole.count()).toBe(0);
  });

  it("revokes a role and records it", async () => {
    const user = await createUser(prisma, { email: "ana@example.test" });
    await grantRole(prisma, change("ana@example.test", "STAFF"));
    await grantRole(prisma, change("ana@example.test", "KITCHEN"));

    const result = await revokeRole(prisma, change("ana@example.test", "STAFF"));
    expect(result.changed).toBe(true);
    const remaining = await prisma.userRole.findMany({ where: { userId: user.id } });
    expect(remaining.map((entry) => entry.role)).toEqual(["KITCHEN"]);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "role.revoke" } });
    expect(log.before).toEqual({ roles: ["STAFF", "KITCHEN"] });
    expect(log.after).toEqual({ roles: ["KITCHEN"] });
  });

  it("revoking a role the user does not have changes nothing", async () => {
    await createUser(prisma, { email: "ana@example.test" });
    const result = await revokeRole(prisma, change("ana@example.test", "STAFF"));
    expect(result.changed).toBe(false);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("never removes the last administrator", async () => {
    await createUser(prisma, { email: "admin@example.test" });
    await grantRole(prisma, change("admin@example.test", "ADMIN"));

    await expect(revokeRole(prisma, change("admin@example.test", "ADMIN"))).rejects.toMatchObject({
      status: 409,
      code: "LAST_ADMIN",
    });
    expect(await prisma.userRole.count({ where: { role: "ADMIN" } })).toBe(1);
  });

  it("allows removing an administrator when another one remains", async () => {
    await createUser(prisma, { email: "one@example.test" });
    await createUser(prisma, { email: "two@example.test" });
    await grantRole(prisma, change("one@example.test", "ADMIN"));
    await grantRole(prisma, change("two@example.test", "ADMIN"));

    const result = await revokeRole(prisma, change("one@example.test", "ADMIN"));
    expect(result.changed).toBe(true);
    expect(await prisma.userRole.count({ where: { role: "ADMIN" } })).toBe(1);
  });
});
