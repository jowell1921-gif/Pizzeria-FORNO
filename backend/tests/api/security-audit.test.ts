import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedDemoData } from "../../prisma/seed-demo-data.js";
import { createApp } from "../../src/app.js";
import { buildOpenApiDocument } from "../../src/docs/openapi.js";
import { createTestClient, resetDatabase, type PrismaClient } from "../db/helpers.js";
import { createTestApp } from "../helpers/app.js";
import { createFakeGateway } from "../helpers/payments.js";

/**
 * Auditoría de seguridad automática. Recorre TODAS las operaciones documentadas en OpenAPI (la misma
 * lista que ve Flutter) y comprueba lo que no puede fallar nunca: que sin sesión no se obtiene nada,
 * que un cliente corriente no entra en el panel ni en la cocina, que las entradas maliciosas no
 * rompen el servidor ni filtran información interna y que las cabeceras de seguridad están.
 */
let prisma: PrismaClient;
let ctx: Awaited<ReturnType<typeof createTestApp>>;
let app: ReturnType<typeof createApp>;

const GENEROUS = { windowMs: 60_000, ipMax: 1e6, userMax: 1e6, userWriteMax: 1e6 };

beforeAll(async () => {
  prisma = createTestClient();
  ctx = await createTestApp(prisma);
  app = createApp(
    {
      CORS_ORIGINS: ["http://localhost:3000"],
      rateLimits: GENEROUS,
      FRONTEND_URL: "http://localhost:3000",
    },
    { prisma, verifyToken: ctx.auth.verifyToken, payments: createFakeGateway().gateway },
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
  await seedDemoData(prisma);
});

type Operation = {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  secured: boolean;
};

function operations(): Operation[] {
  const doc = buildOpenApiDocument() as {
    paths: Record<string, Record<string, { security?: unknown }>>;
  };
  const found: Operation[] = [];
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const method of ["get", "post", "put", "patch", "delete"] as const) {
      const operation = item[method];
      if (operation) found.push({ method, path, secured: Boolean(operation.security) });
    }
  }
  return found;
}

const concrete = (path: string) =>
  `/api/v1${path.replace(/\{(\w+)\}/g, (_m, name: string) =>
    name === "type" ? "ticket" : name === "idOrSlug" ? "margherita" : randomUUID(),
  )}`;

/** Rutas de flujo continuo (SSE): se comprueba el acceso, no se leen hasta el final. */
const isStream = (path: string) => path.endsWith("/stream");

/** Operaciones públicas permitidas. Añadir una ruta pública obliga a tocar esta lista. */
const PUBLIC = [
  "get /categories",
  "get /products",
  "get /products/{idOrSlug}",
  "get /promotions",
  "get /store/settings",
  "get /store/slots",
  "get /delivery-zones",
  "get /delivery-zones/check",
  "get /health",
  "get /loyalty/program",
  "post /checkout/quote",
  "post /webhooks/stripe",
];

const ops = operations();

describe("the surface of the API", () => {
  it("documents a meaningful number of operations", () => {
    expect(ops.length).toBeGreaterThan(80);
  });

  it("has no public operation outside the explicit list", () => {
    const open = ops.filter((op) => !op.secured).map((op) => `${op.method} ${op.path}`);
    expect(open.sort()).toEqual([...PUBLIC].sort());
  });
});

describe("authentication on every protected operation", () => {
  it("answers 401 without a session, to every operation, and returns no data", async () => {
    const leaks: string[] = [];
    for (const op of ops.filter((candidate) => candidate.secured)) {
      const res = await request(app)[op.method](concrete(op.path)).send({});
      if (res.status !== 401) leaks.push(`${op.method} ${op.path} -> ${res.status}`);
      else expect(res.body.data, `${op.method} ${op.path}`).toBeUndefined();
    }
    expect(leaks).toEqual([]);
  });

  it("rejects forged, expired and wrongly signed tokens everywhere", async () => {
    const other = await (await import("../helpers/auth.js")).createTestAuth();
    const tokens = [
      "not-a-token",
      "a.b.c",
      await ctx.auth.sign({ expiresIn: "-10m" }),
      await other.sign({}),
      await ctx.auth.sign({ claims: { role: "service_role" } }),
      await ctx.auth.sign({ claims: { is_anonymous: true } }),
    ];
    for (const token of tokens) {
      for (const path of ["/api/v1/me", "/api/v1/orders/me", "/api/v1/admin/dashboard"]) {
        const res = await request(app).get(path).set("Authorization", `Bearer ${token}`);
        expect(res.status, `${token.slice(0, 12)} ${path}`).toBe(401);
      }
    }
  });
});

describe("authorization: a normal customer never reaches the panel or the kitchen", () => {
  it("answers 403 to every /admin and /kitchen operation", async () => {
    const customer = await ctx.userWithToken({ username: "cliente1", phone: "+34 600 000 000" });
    const allowed: string[] = [];
    for (const op of ops.filter((o) => o.secured && /^\/(admin|kitchen)/.test(o.path))) {
      if (isStream(op.path)) {
        const res = await request(app).get(concrete(op.path)).set(customer.headers);
        if (res.status !== 403) allowed.push(`${op.method} ${op.path} -> ${res.status}`);
        continue;
      }
      const res = await request(app)[op.method](concrete(op.path)).set(customer.headers).send({});
      if (res.status !== 403) allowed.push(`${op.method} ${op.path} -> ${res.status}`);
    }
    expect(allowed).toEqual([]);
  });

  it("does not let the kitchen into the administration or the staff into the sensitive areas", async () => {
    const kitchen = await ctx.userWithToken({ username: "cocina1", phone: "+34 600 000 001" });
    await prisma.userRole.create({ data: { userId: kitchen.user.id, role: "KITCHEN" } });
    const staff = await ctx.userWithToken({ username: "staff1", phone: "+34 600 000 002" });
    await prisma.userRole.create({ data: { userId: staff.user.id, role: "STAFF" } });

    const forKitchen = [
      "/api/v1/admin/dashboard",
      "/api/v1/admin/orders",
      "/api/v1/admin/products",
      "/api/v1/admin/customers",
      "/api/v1/admin/audit",
      "/api/v1/admin/notifications",
    ];
    for (const path of forKitchen) {
      expect((await request(app).get(path).set(kitchen.headers)).status, path).toBe(403);
    }
    const forStaff = [
      "/api/v1/admin/products",
      "/api/v1/admin/store/settings",
      "/api/v1/admin/promotions",
      "/api/v1/admin/loyalty/settings",
      "/api/v1/admin/audit",
      "/api/v1/admin/notifications",
    ];
    for (const path of forStaff) {
      expect((await request(app).get(path).set(staff.headers)).status, path).toBe(403);
    }
    expect(
      (
        await request(app)
          .post(`/api/v1/admin/orders/${randomUUID()}/refund`)
          .set(staff.headers)
          .send({ reason: "xxx" })
      ).status,
    ).toBe(403);
  });

  it("ignores any role, permission or identity claimed by the client", async () => {
    const customer = await ctx.userWithToken({ username: "cliente1", phone: "+34 600 000 000" });
    const other = await ctx.userWithToken({ username: "otro1", phone: "+34 600 000 001" });
    const forged = {
      ...customer.headers,
      "X-User-Id": other.user.id,
      "X-Role": "ADMIN",
      "X-Permissions": "catalog:manage",
    };
    expect((await request(app).get("/api/v1/admin/dashboard").set(forged)).status).toBe(403);
    const me = await request(app).get("/api/v1/me").set(forged);
    expect(me.body.data.id).toBe(customer.user.id);
    const withRole = await ctx.auth.sign({
      sub: customer.user.id,
      claims: {
        app_metadata: { role: "ADMIN" },
        user_metadata: { role: "ADMIN", roles: ["ADMIN"] },
      },
    });
    expect(
      (await request(app).get("/api/v1/admin/dashboard").set("Authorization", `Bearer ${withRole}`))
        .status,
    ).toBe(403);
    // Tampoco por el cuerpo ni la cadena de consulta.
    expect(
      (
        await request(app)
          .patch("/api/v1/me")
          .set(customer.headers)
          .send({ roles: ["ADMIN"] })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .get("/api/v1/orders/me?userId=" + other.user.id)
          .set(customer.headers)
      ).status,
    ).toBe(200);
    expect(await prisma.userRole.count()).toBe(0);
  });
});

describe("customers cannot touch each other's data (IDOR)", () => {
  it("answers 404 for someone else's addresses, orders, documents, payment sessions and rewards", async () => {
    const ana = await ctx.userWithToken({ username: "ana1", phone: "+34 600 000 000" });
    const luis = await ctx.userWithToken({ username: "luis1", phone: "+34 600 000 001" });
    const address = await prisma.address.create({
      data: {
        userId: ana.user.id,
        recipientName: "Ana",
        line1: "Calle 1",
        postalCode: "28001",
        city: "Madrid",
      },
    });
    const product = await prisma.product.findFirstOrThrow({ where: { slug: "margherita" } });
    const order = await prisma.order.create({
      data: {
        userId: ana.user.id,
        type: "PICKUP",
        status: "PENDING_PAYMENT",
        customerName: "Ana",
        customerEmail: "ana@example.test",
        subtotal: "10.00",
        discountTotal: "0.00",
        deliveryFee: "0.00",
        total: "10.00",
        taxTotal: "0.91",
        items: {
          create: [
            {
              productId: product.id,
              productName: "x",
              unitPrice: "10.00",
              quantity: 1,
              taxRate: "10.00",
              lineTotal: "10.00",
              taxAmount: "0.91",
            },
          ],
        },
        payments: {
          create: { method: "ONLINE", status: "PENDING", amount: "10.00", provider: "stripe" },
        },
      },
    });

    const attempts: Array<[string, string, object?]> = [
      ["get", `/api/v1/me/addresses/${address.id}`],
      ["patch", `/api/v1/me/addresses/${address.id}`, { label: "x" }],
      ["delete", `/api/v1/me/addresses/${address.id}`],
      ["get", `/api/v1/orders/${order.id}`],
      ["post", `/api/v1/orders/${order.id}/cancel`],
      ["post", `/api/v1/orders/${order.id}/payment-session`],
      ["get", `/api/v1/orders/${order.id}/documents`],
      ["get", `/api/v1/orders/${order.id}/documents/ticket`],
      [
        "post",
        `/api/v1/orders/${order.id}/invoice`,
        { name: "Luis", taxId: "B12345678", address: "Calle Falsa 1, Madrid" },
      ],
    ];
    for (const [method, path, body] of attempts) {
      const res = await request(app)
        [method as "get"](path)
        .set(luis.headers)
        .send(body ?? {});
      expect(res.status, `${method} ${path}`).toBe(404);
    }
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      "PENDING_PAYMENT",
    );
    expect(await prisma.address.count({ where: { id: address.id } })).toBe(1);
  });
});

describe("malicious input never breaks the server or leaks internals", () => {
  const payloads: unknown[] = [
    {},
    { __proto__: { admin: true }, constructor: { prototype: { admin: true } } },
    { name: '\'; DROP TABLE "Order"; --', id: "' OR '1'='1", q: "%00" },
    { name: "<script>alert(1)</script>", description: "\u0000\ud800", amount: "-1e999" },
    { items: "x".repeat(50_000), name: "x".repeat(10_000) },
    [1, 2, 3],
    null,
    "just a string",
    { items: [{ productId: "../../etc/passwd", quantity: 1e21, optionIds: [null] }] },
  ];

  it("answers every protected operation with an administrator without a server error", async () => {
    const admin = await ctx.userWithToken({ username: "admin1", phone: "+34 600 000 000" });
    await prisma.userRole.create({ data: { userId: admin.user.id, role: "ADMIN" } });
    const failures: string[] = [];
    const leaks: string[] = [];
    for (const op of ops.filter((o) => o.secured && !isStream(o.path))) {
      for (const payload of payloads) {
        const path =
          concrete(op.path) +
          (op.method === "get" ? "?q=%27%3B--&page=-1&pageSize=1e9&status=%00" : "");
        const res = await request(app)
          [op.method](path)
          .set(admin.headers)
          .set("Content-Type", "application/json")
          .send(op.method === "get" ? undefined : JSON.stringify(payload));
        if (res.status >= 500 && res.status !== 502 && res.status !== 503) {
          failures.push(
            `${op.method} ${op.path} ${JSON.stringify(payload).slice(0, 40)} -> ${res.status}`,
          );
        }
        const text = JSON.stringify(res.body ?? "");
        if (
          /stack|prisma|postgres|SELECT |at .*\.ts|node_modules|C:\\\\Users/i.test(text) &&
          res.status >= 400
        ) {
          leaks.push(`${op.method} ${op.path} -> ${text.slice(0, 120)}`);
        }
      }
    }
    expect(failures).toEqual([]);
    expect(leaks).toEqual([]);
    // Nada de lo anterior debe haber convertido a nadie en administrador ni roto la base de datos.
    expect(await prisma.userRole.count()).toBe(1);
    expect(await prisma.product.count()).toBeGreaterThan(0);
  }, 300_000);

  it("rejects malformed and oversized bodies with a client error", async () => {
    const customer = await ctx.userWithToken({ username: "cliente1", phone: "+34 600 000 000" });
    const broken = await request(app)
      .patch("/api/v1/me")
      .set(customer.headers)
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(broken.status).toBe(400);
    expect(JSON.stringify(broken.body)).not.toMatch(/SyntaxError|at /);

    const huge = await request(app)
      .patch("/api/v1/me")
      .set(customer.headers)
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ fullName: "x".repeat(300_000) }));
    expect(huge.status).toBe(413);
  });

  it("rejects bad identifiers and parameters without touching the database", async () => {
    const customer = await ctx.userWithToken({ username: "cliente1", phone: "+34 600 000 000" });
    for (const id of [
      "abc",
      "1",
      "../../x",
      "%2e%2e%2f",
      "' OR 1=1 --",
      "00000000-0000-0000-0000-00000000000z",
    ]) {
      for (const path of [
        `/api/v1/orders/${encodeURIComponent(id)}`,
        `/api/v1/me/addresses/${encodeURIComponent(id)}`,
      ]) {
        const res = await request(app).get(path).set(customer.headers);
        expect([400, 404], path).toContain(res.status);
      }
    }
  });
});

describe("transport and headers", () => {
  it("sends security headers, hides the framework and answers errors as JSON", async () => {
    const res = await request(app).get("/api/v1/products");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["x-frame-options"] ?? res.headers["content-security-policy"]).toBeDefined();
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);

    const missing = await request(app).get("/api/v1/nothing-here");
    expect(missing.status).toBe(404);
    expect(missing.headers["content-type"]).toMatch(/json/);
    expect(missing.body.error.code).toBeDefined();
  });

  it("only allows the configured origin (CORS)", async () => {
    const allowed = await request(app)
      .get("/api/v1/products")
      .set("Origin", "http://localhost:3000");
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    const denied = await request(app).get("/api/v1/products").set("Origin", "https://evil.example");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    const preflight = await request(app)
      .options("/api/v1/orders")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "POST");
    expect(preflight.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("never exposes secrets through any public response", async () => {
    for (const path of ["/api/v1/store/settings", "/api/v1/products", "/api/v1/openapi.json"]) {
      const res = await request(app).get(path);
      expect(JSON.stringify(res.body), path).not.toMatch(
        /sk_(test|live)_|whsec_|sb_secret_|service_role|DATABASE_URL|password/i,
      );
    }
  });
});
