import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedDemoData } from "../../prisma/seed-demo-data.js";
import { createApp } from "../../src/app.js";
import type { ImageStorage } from "../../src/modules/admin/storage.js";
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
  await seedDemoData(prisma);
});

async function withRole(role: "ADMIN" | "STAFF") {
  const current = await ctx.userWithToken({ username: `u_${role}`, phone: "+34 600 000 001" });
  await prisma.userRole.create({ data: { userId: current.user.id, role } });
  return current;
}

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.alloc(4),
  Buffer.from("WEBPVP8 "),
  Buffer.alloc(32),
]);

function appWithStorage() {
  const stored: Array<{ contentType: string; extension: string; size: number }> = [];
  const storage: ImageStorage = {
    async upload({ bytes, contentType, extension }) {
      stored.push({ contentType, extension, size: bytes.length });
      return `https://cdn.example.test/products/${stored.length}.${extension}`;
    },
  };
  const app = createApp(
    { CORS_ORIGINS: [] },
    { prisma, verifyToken: ctx.auth.verifyToken, storage },
  );
  return { app, stored };
}

describe("product image upload", () => {
  it("is disabled (503) until storage is configured", async () => {
    const { headers } = await withRole("ADMIN");
    const response = await request(ctx.app)
      .post("/api/v1/admin/uploads/product-image")
      .set(headers)
      .set("Content-Type", "image/png")
      .send(PNG);
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("STORAGE_NOT_CONFIGURED");
  });

  it("requires a session and catalog:manage", async () => {
    const { app } = appWithStorage();
    const send = (headers: Record<string, string> = {}) =>
      request(app)
        .post("/api/v1/admin/uploads/product-image")
        .set(headers)
        .set("Content-Type", "image/png")
        .send(PNG);
    expect((await send()).status).toBe(401);
    expect((await send((await withRole("STAFF")).headers)).status).toBe(403);
    expect((await send((await ctx.userWithToken()).headers)).status).toBe(403);
  });

  it("stores JPEG, PNG and WebP images by their real content and audits the upload", async () => {
    const { user, headers } = await withRole("ADMIN");
    const { app, stored } = appWithStorage();
    for (const [type, bytes, extension] of [
      ["image/png", PNG, "png"],
      ["image/jpeg", JPEG, "jpg"],
      ["image/webp", WEBP, "webp"],
    ] as const) {
      const response = await request(app)
        .post("/api/v1/admin/uploads/product-image")
        .set(headers)
        .set("Content-Type", type)
        .send(bytes);
      expect(response.status, type).toBe(201);
      expect(response.body.data.url).toMatch(
        new RegExp(`^https://cdn\\.example\\.test/products/\\d+\\.${extension}$`),
      );
    }
    expect(stored.map((item) => item.extension)).toEqual(["png", "jpg", "webp"]);
    const audit = await prisma.auditLog.findMany({ where: { action: "upload.product-image" } });
    expect(audit).toHaveLength(3);
    expect(audit[0]).toMatchObject({ actorId: user.id });
  });

  it("checks the bytes, not the declared type, and enforces the size limit", async () => {
    const { headers } = await withRole("ADMIN");
    const { app, stored } = appWithStorage();
    const post = (type: string, body: Buffer | string) =>
      request(app)
        .post("/api/v1/admin/uploads/product-image")
        .set(headers)
        .set("Content-Type", type)
        .send(body);

    const fake = await post("image/png", Buffer.from("<script>alert(1)</script>".repeat(5)));
    expect(fake.status).toBe(400);
    expect(fake.body.error.code).toBe("INVALID_IMAGE");
    // Un PNG que dice ser JPEG se acepta por lo que es (el tipo se deduce de los bytes).
    expect((await post("image/jpeg", PNG)).status).toBe(201);
    expect(stored.at(-1)?.contentType).toBe("image/png");
    // Otros tipos ni se leen.
    expect((await post("text/plain", "hola")).status).toBe(400);
    expect((await post("image/svg+xml", "<svg/>")).status).toBe(400);
    const huge = Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]);
    expect((await post("image/png", huge)).status).toBe(413);
    expect(stored).toHaveLength(1);
  });

  it("the uploaded URL can be used as the product image", async () => {
    const { headers } = await withRole("ADMIN");
    const { app } = appWithStorage();
    const url = (
      await request(app)
        .post("/api/v1/admin/uploads/product-image")
        .set(headers)
        .set("Content-Type", "image/webp")
        .send(WEBP)
    ).body.data.url as string;
    const product = await prisma.product.findFirstOrThrow({ where: { slug: "diavola" } });
    const updated = await request(app)
      .patch(`/api/v1/admin/products/${product.id}`)
      .set(headers)
      .send({ image: { url, alt: "Diavola" } });
    expect(updated.status).toBe(200);
    expect(updated.body.data.image).toEqual({ url, alt: "Diavola" });
    expect((await request(app).get("/api/v1/products/diavola")).body.data.image.url).toBe(url);
  });
});

describe("audit log", () => {
  it("is readable only with audit:read and lists the administrative operations", async () => {
    const admin = await withRole("ADMIN");
    const staff = await withRole("STAFF");
    const api = () => request(ctx.app);
    expect((await api().get("/api/v1/admin/audit")).status).toBe(401);
    expect((await api().get("/api/v1/admin/audit").set(staff.headers)).status).toBe(403);

    await api()
      .patch("/api/v1/admin/store/settings")
      .set(admin.headers)
      .send({ prepTimeMinutes: 30 });
    const product = await prisma.product.findFirstOrThrow({ where: { slug: "margherita" } });
    await api()
      .patch(`/api/v1/admin/products/${product.id}`)
      .set(admin.headers)
      .send({ basePrice: "10.00" });
    await api().post("/api/v1/admin/categories").set(admin.headers).send({ name: "Ensaladas" });

    const all = await api().get("/api/v1/admin/audit").set(admin.headers);
    expect(all.status).toBe(200);
    expect(all.body.meta.total).toBe(3);
    expect(all.body.data[0]).toMatchObject({
      action: "category.create",
      actor: { email: admin.user.email },
    });

    const price = await api().get("/api/v1/admin/audit?entityType=Product").set(admin.headers);
    expect(price.body.data).toHaveLength(1);
    expect(price.body.data[0]).toMatchObject({ action: "product.update", entityId: product.id });
    expect(price.body.data[0].before).toMatchObject({ basePrice: "9.50" });
    expect(price.body.data[0].after).toMatchObject({ basePrice: "10.00" });

    expect(
      (await api().get("/api/v1/admin/audit?action=store.").set(admin.headers)).body.data,
    ).toHaveLength(1);
    expect(
      (await api().get(`/api/v1/admin/audit?actorId=${admin.user.id}`).set(admin.headers)).body.meta
        .total,
    ).toBe(3);
    expect(
      (await api().get("/api/v1/admin/audit?pageSize=2&page=2").set(admin.headers)).body.data,
    ).toHaveLength(1);
    expect((await api().get("/api/v1/admin/audit?actorId=no-uuid").set(admin.headers)).status).toBe(
      400,
    );
  });
});
