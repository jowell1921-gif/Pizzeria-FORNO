import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../src/app.js";
import { selfAdminEnabled } from "../../src/config/env.js";
import { createTestClient, resetDatabase, type PrismaClient } from "../db/helpers.js";
import { createTestApp } from "../helpers/app.js";

let prisma: PrismaClient;
let ctx: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  prisma = createTestClient();
  ctx = await createTestApp(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
});

const enabledApp = () =>
  createApp(
    { CORS_ORIGINS: [], SELF_ADMIN_ENABLED: true },
    { prisma, verifyToken: ctx.auth.verifyToken },
  );

describe("selfAdminEnabled", () => {
  it("is on by default (demo site) and can be switched off", () => {
    expect(selfAdminEnabled({ SELF_ADMIN_ENABLED: undefined })).toBe(true);
    expect(selfAdminEnabled({ SELF_ADMIN_ENABLED: true })).toBe(true);
    expect(selfAdminEnabled({ SELF_ADMIN_ENABLED: false })).toBe(false);
  });
});

describe("demo self-service administrator role", () => {
  it("is refused (403) when the server has it disabled, and nothing changes", async () => {
    const { user, headers } = await ctx.userWithToken();
    const profile = await request(ctx.app).get("/api/v1/me").set(headers);
    expect(profile.body.data.selfAdminAvailable).toBe(false);
    for (const method of ["put", "delete"] as const) {
      const response = await request(ctx.app)[method]("/api/v1/me/admin-role").set(headers);
      expect(response.status, method).toBe(403);
      expect(response.body.error.code).toBe("SELF_ADMIN_DISABLED");
    }
    expect(await prisma.userRole.count({ where: { userId: user.id } })).toBe(0);
  });

  it("requires a session", async () => {
    const app = enabledApp();
    expect((await request(app).put("/api/v1/me/admin-role")).status).toBe(401);
    expect((await request(app).delete("/api/v1/me/admin-role")).status).toBe(401);
  });

  it("grants and removes the ADMIN role to the caller only, with an audit trail", async () => {
    const app = enabledApp();
    const me = await ctx.userWithToken({ username: "yo_mismo", phone: "+34 600 000 001" });
    const other = await ctx.userWithToken({ username: "otra", phone: "+34 600 000 002" });

    const before = await request(app).get("/api/v1/me").set(me.headers);
    expect(before.body.data).toMatchObject({ selfAdminAvailable: true, roles: [] });
    expect((await request(app).get("/api/v1/admin/dashboard").set(me.headers)).status).toBe(403);

    const granted = await request(app).put("/api/v1/me/admin-role").set(me.headers);
    expect(granted.status).toBe(200);
    expect(granted.body.data.roles).toEqual(["ADMIN"]);
    expect(granted.body.data.permissions).toContain("catalog:manage");
    expect((await request(app).get("/api/v1/admin/dashboard").set(me.headers)).status).toBe(200);

    // Es idempotente y no toca a los demás.
    expect((await request(app).put("/api/v1/me/admin-role").set(me.headers)).status).toBe(200);
    expect(await prisma.userRole.count({ where: { userId: me.user.id } })).toBe(1);
    expect(await prisma.userRole.count({ where: { userId: other.user.id } })).toBe(0);

    const revoked = await request(app).delete("/api/v1/me/admin-role").set(me.headers);
    expect(revoked.status).toBe(200);
    expect(revoked.body.data.roles).toEqual([]);
    expect((await request(app).get("/api/v1/admin/dashboard").set(me.headers)).status).toBe(403);

    const audit = await prisma.auditLog.findMany({
      where: { entityType: "Profile" },
      orderBy: { createdAt: "asc" },
    });
    expect(audit.map((entry) => entry.action)).toEqual(["role.self-grant", "role.self-revoke"]);
    expect(audit[0]).toMatchObject({ actorId: me.user.id, entityId: me.user.id });
  });

  it("only removes ADMIN: other roles are kept", async () => {
    const app = enabledApp();
    const me = await ctx.userWithToken({ username: "cocinero", phone: "+34 600 000 003" });
    await prisma.userRole.create({ data: { userId: me.user.id, role: "KITCHEN" } });
    await request(app).put("/api/v1/me/admin-role").set(me.headers);
    const revoked = await request(app).delete("/api/v1/me/admin-role").set(me.headers);
    expect(revoked.body.data.roles).toEqual(["KITCHEN"]);
  });
});
