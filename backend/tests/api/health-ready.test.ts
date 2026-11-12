import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../src/app.js";
import { createPrismaClient } from "../../src/db/client.js";
import { createTestClient, type PrismaClient } from "../db/helpers.js";
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

describe("GET /api/v1/health/ready", () => {
  it("reports ready when the database answers, without needing a session", async () => {
    const res = await request(ctx.app).get("/api/v1/health/ready");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: "ready" } });
  });

  it("answers 503 NOT_READY (without internals) when the database is unreachable", async () => {
    const broken = createPrismaClient("postgresql://forno:x@127.0.0.1:1/forno_test");
    const app = createApp(
      { CORS_ORIGINS: [] },
      { prisma: broken, verifyToken: ctx.auth.verifyToken },
    );
    const res = await request(app).get("/api/v1/health/ready");
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("NOT_READY");
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|127\.0\.0\.1|prisma/i);
    // La vivacidad no depende de la base de datos.
    expect((await request(app).get("/api/v1/health")).status).toBe(200);
    await broken.$disconnect().catch(() => undefined);
  }, 60_000);
});
