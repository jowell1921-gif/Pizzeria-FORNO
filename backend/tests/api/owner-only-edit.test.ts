import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../src/app.js";
import { seedDemoData } from "../../prisma/seed-demo-data.js";
import { createTestClient, createUser, resetDatabase, type PrismaClient } from "../db/helpers.js";
import { createTestAuth } from "../helpers/auth.js";

const OWNER = "Dueno@Ejemplo.test";

let prisma: PrismaClient;
let auth: Awaited<ReturnType<typeof createTestAuth>>;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  prisma = createTestClient();
  auth = await createTestAuth();
  app = createApp(
    { CORS_ORIGINS: [], OWNER_EMAIL: OWNER, SELF_ADMIN_ENABLED: true },
    { prisma, verifyToken: auth.verifyToken },
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
  await seedDemoData(prisma);
});

const api = () => request(app);

let counter = 0;

async function admin(email: string) {
  const user = await createUser(prisma, {
    email,
    username: `u_${randomUUID().slice(0, 8)}`,
    phone: `+34 600 000 ${String(++counter).padStart(3, "0")}`,
  });
  await prisma.userRole.create({ data: { userId: user.id, role: "ADMIN" } });
  const token = await auth.sign({ sub: user.id, email: user.email });
  return { headers: { Authorization: `Bearer ${token}` } };
}

const READS = [
  "/api/v1/admin/categories",
  "/api/v1/admin/products",
  "/api/v1/admin/promotions",
  "/api/v1/admin/rewards",
  "/api/v1/admin/loyalty/settings",
  "/api/v1/admin/loyalty/transactions",
  "/api/v1/admin/store/settings",
  "/api/v1/admin/store/opening-hours",
  "/api/v1/admin/delivery-zones",
  "/api/v1/admin/notifications",
];

describe("content editing is limited to the owner", () => {
  it("lets any other administrator read every section but not change anything", async () => {
    const { headers } = await admin("visitante@ejemplo.test");

    for (const path of READS) {
      expect((await api().get(path).set(headers)).status, path).toBe(200);
    }

    const writes = [
      api().post("/api/v1/admin/categories").send({ name: "Ensaladas" }),
      api().post("/api/v1/admin/products").send({}),
      api().post("/api/v1/admin/promotions").send({}),
      api().post("/api/v1/admin/rewards").send({}),
      api().patch("/api/v1/admin/loyalty/settings").send({ pointsPerEuro: "2.0000" }),
      api().post("/api/v1/admin/loyalty/adjustments").send({}),
      api().patch("/api/v1/admin/store/settings").send({ name: "Otro nombre" }),
      api().put("/api/v1/admin/store/opening-hours").send({ days: [] }),
      api().post("/api/v1/admin/delivery-zones").send({}),
      api().delete("/api/v1/admin/promotions/00000000-0000-4000-8000-000000000000"),
    ];
    for (const write of writes) {
      const response = await write.set(headers);
      expect(response.status, `${response.request.method} ${response.request.url}`).toBe(403);
    }
    // Nada cambió.
    expect(await prisma.category.count({ where: { slug: "ensaladas" } })).toBe(0);
    expect((await prisma.storeSettings.findFirstOrThrow()).name).not.toBe("Otro nombre");
  });

  it("still lets that administrator manage orders and use the kitchen", async () => {
    const { headers } = await admin("visitante@ejemplo.test");
    expect((await api().get("/api/v1/admin/orders").set(headers)).status).toBe(200);
    expect((await api().get("/api/v1/kitchen/orders").set(headers)).status).toBe(200);
  });

  it("lets the owner change content, whatever the capitalisation of the e-mail", async () => {
    const { headers } = await admin(OWNER.toLowerCase());
    const created = await api()
      .post("/api/v1/admin/categories")
      .set(headers)
      .send({ name: "Ensaladas" });
    expect(created.status).toBe(201);
  });

  it("tells the web which permissions each user really has", async () => {
    const other = await admin("visitante@ejemplo.test");
    const owner = await admin(OWNER.toLowerCase());

    const otherPermissions: string[] = (await api().get("/api/v1/me").set(other.headers)).body.data
      .permissions;
    expect(otherPermissions).toEqual(
      expect.arrayContaining(["catalog:read", "promotions:read", "loyalty:read", "settings:read"]),
    );
    for (const manage of [
      "catalog:manage",
      "promotions:manage",
      "loyalty:manage",
      "settings:manage",
    ]) {
      expect(otherPermissions).not.toContain(manage);
    }

    const ownerPermissions: string[] = (await api().get("/api/v1/me").set(owner.headers)).body.data
      .permissions;
    expect(ownerPermissions).toEqual(
      expect.arrayContaining(["catalog:manage", "settings:manage", "catalog:read"]),
    );
  });

  it("does not let a visitor become the owner by claiming it", async () => {
    const { headers } = await admin("visitante@ejemplo.test");
    const response = await api()
      .post("/api/v1/admin/categories")
      .set(headers)
      .set("X-Owner-Email", OWNER)
      .send({ name: "Ensaladas" });
    expect(response.status).toBe(403);
  });
});
