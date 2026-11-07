import { randomUUID } from "node:crypto";

import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../src/app.js";
import { createAuthenticate, requirePermission } from "../../src/auth/authenticate.js";
import type { Permission } from "../../src/auth/permissions.js";
import { grantRole } from "../../src/auth/roles-service.js";
import { errorHandler } from "../../src/middleware/error-handler.js";
import { createTestClient, createUser, resetDatabase, type PrismaClient } from "../db/helpers.js";
import { createTestAuth } from "../helpers/auth.js";

let prisma: PrismaClient;
let auth: Awaited<ReturnType<typeof createTestAuth>>;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  prisma = createTestClient();
  auth = await createTestAuth();
  app = createApp(
    { CORS_ORIGINS: ["http://localhost:3000"] },
    { prisma, verifyToken: auth.verifyToken },
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
});

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("authentication of requests", () => {
  it("rejects requests without credentials, with the standard error format", async () => {
    const response = await request(app).get("/api/v1/me");
    expect(response.status).toBe(401);
    expect(response.headers["www-authenticate"]).toMatch(/^Bearer/);
    expect(response.body.error).toMatchObject({ code: "UNAUTHENTICATED" });
    expect(response.body.error.requestId).toBe(response.headers["x-request-id"]);
    expect(await prisma.profile.count()).toBe(0);
  });

  it("rejects malformed authorization headers", async () => {
    for (const header of ["Basic abc", "Bearer", "Bearer a b", "abc.def.ghi", "bearer"]) {
      const response = await request(app).get("/api/v1/me").set("Authorization", header);
      expect(response.status, header).toBe(401);
    }
  });

  it("rejects an invalid token and an expired token with different codes", async () => {
    const invalid = await request(app).get("/api/v1/me").set(bearer("not.a.token"));
    expect(invalid.status).toBe(401);
    expect(invalid.body.error.code).toBe("INVALID_TOKEN");

    const expired = await request(app)
      .get("/api/v1/me")
      .set(bearer(await auth.sign({ expiresIn: "-1m" })));
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe("TOKEN_EXPIRED");
    expect(await prisma.profile.count()).toBe(0);
  });

  it("does not leak internal details in errors", async () => {
    const response = await request(app).get("/api/v1/me").set(bearer("garbage"));
    expect(JSON.stringify(response.body)).not.toMatch(/jose|stack|node_modules|at \w+ \(/i);
  });
});

describe("profile creation on first request", () => {
  it("creates the profile from the verified identity, once", async () => {
    const sub = randomUUID();
    const token = await auth.sign({
      sub,
      email: "ana@example.test",
      claims: { user_metadata: { full_name: "Ana López" } },
    });

    const first = await request(app).get("/api/v1/me").set(bearer(token));
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({
      id: sub,
      email: "ana@example.test",
      fullName: "Ana López",
      roles: [],
      marketingConsent: false,
    });

    const second = await request(app).get("/api/v1/me").set(bearer(token));
    expect(second.status).toBe(200);
    expect(await prisma.profile.count()).toBe(1);
  });

  it("uses the email name when the provider gives no name", async () => {
    const token = await auth.sign({ email: "luis.perez@example.test" });
    const response = await request(app).get("/api/v1/me").set(bearer(token));
    expect(response.body.data.fullName).toBe("luis.perez");
  });

  it("is safe with simultaneous first requests (one profile, every request succeeds)", async () => {
    const token = await auth.sign({ email: "race@example.test" });
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => request(app).get("/api/v1/me").set(bearer(token))),
    );
    expect(responses.map((response) => response.status)).toEqual(Array(10).fill(200));
    expect(await prisma.profile.count()).toBe(1);
  });

  it("refuses a disabled account", async () => {
    const user = await createUser(prisma, { deletedAt: new Date() });
    const response = await request(app)
      .get("/api/v1/me")
      .set(bearer(await auth.sign({ sub: user.id, email: user.email })));
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ACCOUNT_DISABLED");
  });

  it("keeps the stored email in sync when it changes in Supabase", async () => {
    const sub = randomUUID();
    await request(app)
      .get("/api/v1/me")
      .set(bearer(await auth.sign({ sub, email: "old@example.test" })));
    const response = await request(app)
      .get("/api/v1/me")
      .set(bearer(await auth.sign({ sub, email: "new@example.test" })));
    expect(response.body.data.email).toBe("new@example.test");
    expect(await prisma.profile.count()).toBe(1);
  });

  it("does not link a second identity to an email that already belongs to another account", async () => {
    await createUser(prisma, { email: "taken@example.test" });
    const response = await request(app)
      .get("/api/v1/me")
      .set(bearer(await auth.sign({ email: "taken@example.test" })));
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ACCOUNT_CONFLICT");
    expect(await prisma.profile.count()).toBe(1);
  });
});

describe("roles and permissions come from the database, never from the client", () => {
  it("ignores role claims inside the token", async () => {
    const token = await auth.sign({
      claims: {
        app_metadata: { role: "ADMIN", roles: ["ADMIN"] },
        user_metadata: { role: "ADMIN", roles: ["ADMIN"] },
      },
    });
    const response = await request(app).get("/api/v1/me").set(bearer(token));
    expect(response.body.data.roles).toEqual([]);
    expect(response.body.data.permissions).not.toContain("orders:read:all");
  });

  it("ignores identity and role headers sent by the client", async () => {
    const sub = randomUUID();
    const victim = await createUser(prisma);
    await grantRole(prisma, { email: victim.email, role: "ADMIN", reason: "test" });

    const response = await request(app)
      .get("/api/v1/me")
      .set(bearer(await auth.sign({ sub })))
      .set({
        "X-User-Id": victim.id,
        "X-Role": "ADMIN",
        "X-Roles": "ADMIN",
        "X-User-Email": victim.email,
      })
      .query({ userId: victim.id, role: "ADMIN" });
    expect(response.body.data.id).toBe(sub);
    expect(response.body.data.roles).toEqual([]);
  });

  it("reads the roles that were granted in the database", async () => {
    const sub = randomUUID();
    await request(app)
      .get("/api/v1/me")
      .set(bearer(await auth.sign({ sub, email: "staff@example.test" })));
    await grantRole(prisma, { email: "staff@example.test", role: "STAFF", reason: "test" });

    const response = await request(app)
      .get("/api/v1/me")
      .set(bearer(await auth.sign({ sub, email: "staff@example.test" })));
    expect(response.body.data.roles).toEqual(["STAFF"]);
    expect(response.body.data.permissions).toContain("orders:read:all");
    expect(response.body.data.permissions).not.toContain("roles:manage");
  });
});

describe("PATCH /api/v1/me", () => {
  async function signedIn(email = "ana@example.test") {
    const sub = randomUUID();
    return { sub, token: await auth.sign({ sub, email }) };
  }

  it("updates the editable fields", async () => {
    const { token } = await signedIn();
    const response = await request(app)
      .patch("/api/v1/me")
      .set(bearer(token))
      .send({ fullName: "  Ana García ", phone: "+34 600 000 000" });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ fullName: "Ana García", phone: "+34 600 000 000" });
  });

  it("records when marketing consent was given and clears it when withdrawn", async () => {
    const { sub, token } = await signedIn();
    await request(app).patch("/api/v1/me").set(bearer(token)).send({ marketingConsent: true });
    const given = await prisma.profile.findUniqueOrThrow({ where: { id: sub } });
    expect(given.marketingConsent).toBe(true);
    expect(given.marketingConsentAt).toBeInstanceOf(Date);

    await request(app).patch("/api/v1/me").set(bearer(token)).send({ marketingConsent: false });
    const withdrawn = await prisma.profile.findUniqueOrThrow({ where: { id: sub } });
    expect(withdrawn.marketingConsent).toBe(false);
    expect(withdrawn.marketingConsentAt).toBeNull();
  });

  it("rejects fields the user must not change (email, id, roles, anything unknown)", async () => {
    const { sub, token } = await signedIn();
    for (const body of [
      { email: "other@example.test" },
      { id: randomUUID() },
      { roles: ["ADMIN"] },
      { fullName: "Ana", isAdmin: true },
    ]) {
      const response = await request(app).patch("/api/v1/me").set(bearer(token)).send(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
    const profile = await prisma.profile.findUniqueOrThrow({
      where: { id: sub },
      include: { roles: true },
    });
    expect(profile.email).toBe("ana@example.test");
    expect(profile.roles).toHaveLength(0);
  });

  it("validates the values", async () => {
    const { token } = await signedIn();
    for (const body of [
      {},
      { fullName: "" },
      { fullName: "x".repeat(121) },
      { phone: "abc" },
      { marketingConsent: "yes" },
    ]) {
      const response = await request(app).patch("/api/v1/me").set(bearer(token)).send(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("answers invalid JSON with a clean 400", async () => {
    const { token } = await signedIn();
    const response = await request(app)
      .patch("/api/v1/me")
      .set(bearer(token))
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_JSON");
  });

  it("requires authentication", async () => {
    const response = await request(app).patch("/api/v1/me").send({ fullName: "Ana" });
    expect(response.status).toBe(401);
  });
});

describe("protecting privileged routes (critical case 2)", () => {
  type Roles = Array<"ADMIN" | "STAFF" | "KITCHEN">;
  const PRIVILEGED: Permission[] = [
    "orders:read:all",
    "kitchen:orders:read",
    "settings:manage",
    "roles:manage",
    "payments:read",
  ];

  // En Express los dos puntos de una ruta son parámetros: se sustituyen en la URL de prueba.
  const guardedPath = (permission: Permission) => `/guarded/${permission.replace(/:/g, "_")}`;

  // Rutas de prueba con los mismos middleware que usarán los endpoints reales del panel y la cocina.
  function guardedApp() {
    const authenticate = createAuthenticate({ prisma, verifyToken: auth.verifyToken });
    const guarded = express();
    for (const permission of PRIVILEGED) {
      guarded.get(
        guardedPath(permission),
        authenticate,
        requirePermission(permission),
        (_req, res) => {
          res.json({ ok: true });
        },
      );
    }
    guarded.use(errorHandler);
    return guarded;
  }

  async function userWith(roles: Roles) {
    const sub = randomUUID();
    const email = `u-${sub.slice(0, 8)}@example.test`;
    await createUser(prisma, { id: sub, email });
    for (const role of roles) await grantRole(prisma, { email, role, reason: "test" });
    return auth.sign({ sub, email });
  }

  async function statusFor(roles: Roles | null, permission: Permission) {
    const call = request(guardedApp()).get(guardedPath(permission));
    if (roles) call.set(bearer(await userWith(roles)));
    return (await call).status;
  }

  it("answers 401 to anonymous visitors on every privileged route", async () => {
    for (const permission of PRIVILEGED) {
      expect(await statusFor(null, permission), permission).toBe(401);
    }
  });

  it("answers 403 to a signed-in customer on every privileged route", async () => {
    for (const permission of PRIVILEGED) {
      expect(await statusFor([], permission), permission).toBe(403);
    }
  });

  it("limits the kitchen to the kitchen screen", async () => {
    expect(await statusFor(["KITCHEN"], "kitchen:orders:read")).toBe(200);
    for (const permission of PRIVILEGED.filter((item) => item !== "kitchen:orders:read")) {
      expect(await statusFor(["KITCHEN"], permission), permission).toBe(403);
    }
  });

  it("lets staff manage orders and the kitchen but not settings or roles", async () => {
    expect(await statusFor(["STAFF"], "orders:read:all")).toBe(200);
    expect(await statusFor(["STAFF"], "kitchen:orders:read")).toBe(200);
    expect(await statusFor(["STAFF"], "payments:read")).toBe(200);
    expect(await statusFor(["STAFF"], "settings:manage")).toBe(403);
    expect(await statusFor(["STAFF"], "roles:manage")).toBe(403);
  });

  it("lets administrators in everywhere", async () => {
    for (const permission of PRIVILEGED) {
      expect(await statusFor(["ADMIN"], permission), permission).toBe(200);
    }
  });

  it("applies a role change on the next request, without waiting for a new token", async () => {
    const sub = randomUUID();
    const email = "promoted@example.test";
    await createUser(prisma, { id: sub, email });
    const token = await auth.sign({ sub, email });
    const guarded = guardedApp();
    const call = () => request(guarded).get(guardedPath("orders:read:all")).set(bearer(token));

    expect((await call()).status).toBe(403);
    await grantRole(prisma, { email, role: "STAFF", reason: "test" });
    expect((await call()).status).toBe(200);
    await prisma.userRole.deleteMany({ where: { userId: sub } });
    expect((await call()).status).toBe(403);
  });
});
