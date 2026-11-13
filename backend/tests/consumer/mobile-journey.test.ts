import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedDemoData } from "../../prisma/seed-demo-data.js";
import { createApp } from "../../src/app.js";
import { createKnowledgeProvider } from "../../src/modules/assistant/knowledge.js";
import { createAssistantService } from "../../src/modules/assistant/assistant.service.js";
import { adjustPoints } from "../../src/modules/loyalty/ledger.service.js";
import { changeOrderStatus } from "../../src/modules/orders/status.service.js";
import { createTestClient, resetDatabase, type PrismaClient } from "../db/helpers.js";
import { createTestAuth } from "../helpers/auth.js";
import { createFakeGateway } from "../helpers/payments.js";
import { createSpecClient, type SpecClient } from "./spec-client.js";
import { writeExamples } from "./write-examples.js";

/**
 * Prueba de consumo de la API desde un cliente independiente (decisión 12 del propietario): recorre,
 * por HTTP y usando solo el contrato publicado en `docs/api/openapi.json`, el mismo viaje que hará la
 * app Flutter. Si el servidor responde algo que el contrato no describe, esta prueba falla.
 */
let prisma: PrismaClient;
let auth: Awaited<ReturnType<typeof createTestAuth>>;
let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let api: SpecClient;

beforeAll(async () => {
  prisma = createTestClient();
  auth = await createTestAuth();
  const assistant = createAssistantService({
    model: {
      name: "fake",
      complete: async () => ({
        text: "Tenemos Margherita. Mira la carta.",
        refused: false,
        usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 0 },
      }),
    },
    knowledge: createKnowledgeProvider(prisma, { onlineAvailable: true }),
    dailyLimit: 100,
  });
  const app = createApp(
    {
      CORS_ORIGINS: [],
      FRONTEND_URL: "http://localhost:3000",
      rateLimits: { windowMs: 60_000, ipMax: 1e6, userMax: 1e6, userWriteMax: 1e6 },
    },
    { prisma, verifyToken: auth.verifyToken, payments: createFakeGateway().gateway, assistant },
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  api = await createSpecClient(`http://127.0.0.1:${port}`);
});

afterAll(async () => {
  if (process.env["UPDATE_EXAMPLES"] === "1") writeExamples(api.exchanges());
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
  await seedDemoData(prisma);
  await prisma.openingHours.deleteMany();
  await prisma.openingHours.createMany({
    data: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
      dayOfWeek,
      openMinute: 0,
      closeMinute: 1440,
    })),
  });
  await prisma.storeSettings.update({
    where: { id: 1 },
    data: { enabledPaymentMethods: ["ONLINE", "CASH_PICKUP", "CASH_DELIVERY"] },
  });
});

const MONEY = /^-?\d+\.\d{2}$/;
const user = { id: randomUUID(), email: "flutter@example.test" };
const tokenFor = (expiresIn = "1h") => auth.sign({ sub: user.id, email: user.email, expiresIn });

async function firstLine(quantity = 1) {
  const detail = await api.call("getProductsByIdOrSlug", { path: { idOrSlug: "margherita" } });
  const product = detail.body.data;
  const required = product.optionGroups.filter((group: { required: boolean }) => group.required);
  const optionIds = required.flatMap(
    (group: { options: Array<{ id: string; isDefault: boolean }> }) =>
      group.options.filter((option) => option.isDefault).map((option) => option.id),
  );
  return { productId: product.id as string, quantity, optionIds: optionIds as string[] };
}

describe("a mobile app consuming the published contract", () => {
  it("reads the public catalog, promotions, store, zones and club (no session)", async () => {
    const categories = await api.call("getCategories");
    expect(categories.body.data.length).toBeGreaterThan(0);
    const products = await api.call("getProducts");
    expect(products.body.data.length).toBeGreaterThan(5);
    for (const product of products.body.data) {
      expect(product.price, product.name).toMatch(MONEY); // el dinero siempre es texto decimal
    }
    await api.call("getProducts", { query: { popular: "true" } });
    await api.call("getPromotions");
    const settings = await api.call("getStoreSettings");
    expect(settings.body.data.currency).toBe("EUR");
    expect(settings.body.data.enabledPaymentMethods).toContain("ONLINE");
    await api.call("getStoreSlots", { query: { type: "PICKUP" } });
    await api.call("getDeliveryZones");
    const covered = await api.call("getDeliveryZonesCheck", { query: { postalCode: "28001" } });
    expect(covered.body.data.covered).toBe(true);
    const program = await api.call("getLoyaltyProgram");
    expect(program.body.data.rewards.length).toBeGreaterThan(0);
    await api.call("getHealth");
    await api.call("getHealthReady");

    const quote = await api.call("postCheckoutQuote", {
      body: { items: [await firstLine(2)], type: "PICKUP" },
    });
    expect(quote.body.data.totals.total).toMatch(MONEY);
  });

  it("describes every error with the same shape, and the session can be renewed after a 401", async () => {
    const noSession = await api.call("getMe");
    expect(noSession.status).toBe(401);
    expect(noSession.body.error).toMatchObject({
      code: expect.any(String),
      message: expect.any(String),
    });
    expect(noSession.body.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(noSession.headers.get("x-request-id")).toBe(noSession.body.error.requestId);

    // Token caducado: la app debe pedir uno nuevo a Supabase (supabase_flutter lo hace sola) y reintentar.
    const expired = await api.call("getMe", { token: await tokenFor("-1m") });
    expect(expired.status).toBe(401);
    const renewed = await api.call("getMe", { token: await tokenFor() });
    expect(renewed.status).toBe(200);

    const missing = await api.call("getOrdersById", {
      path: { id: randomUUID() },
      token: await tokenFor(),
    });
    expect(missing.status).toBe(404);
    const invalid = await api.call("postOrders", {
      token: await tokenFor(),
      headers: { "Idempotency-Key": randomUUID() },
      body: { items: [], type: "PICKUP", paymentMethod: "CASH_PICKUP", total: "0.01" },
      skipRequestValidation: true,
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBeDefined();
  });

  it("manages the profile and the addresses", async () => {
    const token = await tokenFor();
    const profile = await api.call("getMe", { token });
    expect(profile.body.data).toMatchObject({
      email: user.email,
      profileComplete: false,
      roles: [],
    });
    const updated = await api.call("patchMe", {
      token,
      body: { username: "flutter_1", phone: "+34 600 000 000", fullName: "Cliente Flutter" },
    });
    expect(updated.body.data.profileComplete).toBe(true);

    const created = await api.call("postMeAddresses", {
      token,
      body: {
        recipientName: "Cliente",
        line1: "Calle Mayor 1",
        postalCode: "28001",
        city: "Madrid",
      },
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    await api.call("patchMeAddressesById", { token, path: { id }, body: { label: "Casa" } });
    expect((await api.call("getMeAddresses", { token })).body.data).toHaveLength(1);
    expect((await api.call("deleteMeAddressesById", { token, path: { id } })).status).toBe(204);
  });

  it("places a cash order with an idempotency key, lists it, reads its detail and cancels it", async () => {
    const token = await tokenFor();
    await api.call("patchMe", { token, body: { username: "flutter_2", phone: "+34 600 000 001" } });
    await api.call("putCart", { token, body: { items: [await firstLine(2)] } });
    expect((await api.call("getCart", { token })).body.data.items).toHaveLength(1);

    const key = randomUUID();
    const body = { items: [await firstLine(2)], type: "PICKUP", paymentMethod: "CASH_PICKUP" };
    const first = await api.call("postOrders", {
      token,
      body,
      headers: { "Idempotency-Key": key },
    });
    expect(first.status).toBe(201);
    expect(first.body.data.status).toBe("NEW");
    expect(first.body.data.totals.total).toMatch(MONEY);
    // La app puede reintentar la misma petición sin duplicar el pedido.
    const replay = await api.call("postOrders", {
      token,
      body,
      headers: { "Idempotency-Key": key },
    });
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(replay.headers.get("idempotent-replayed")).toBe("true");

    const list = await api.call("getOrdersMe", { token, query: { page: 1, pageSize: 10 } });
    expect(list.body.meta).toMatchObject({ page: 1, pageSize: 10, total: 1, totalPages: 1 });
    const detail = await api.call("getOrdersById", { token, path: { id: first.body.data.id } });
    expect(detail.body.data.payments[0]).toMatchObject({
      method: "CASH_PICKUP",
      status: "CASH_PENDING",
    });
    expect(
      (await api.call("getOrdersByIdDocuments", { token, path: { id: first.body.data.id } })).body
        .data.settled,
    ).toBe(false);

    const cancelled = await api.call("postOrdersByIdCancel", {
      token,
      path: { id: first.body.data.id },
    });
    expect(cancelled.body.data.status).toBe("CANCELLED");
  });

  it("downloads the ticket and asks for the invoice once the order is paid", async () => {
    const token = await tokenFor();
    await api.call("patchMe", { token, body: { username: "flutter_4", phone: "+34 600 000 003" } });
    const order = await api.call("postOrders", {
      token,
      headers: { "Idempotency-Key": randomUUID() },
      body: { items: [await firstLine(2)], type: "PICKUP", paymentMethod: "CASH_PICKUP" },
    });
    const id = order.body.data.id as string;

    // Sin cobrar no hay documentos.
    const early = await api.call("getOrdersByIdDocumentsByType", {
      token,
      path: { id, type: "ticket" },
    });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("DOCUMENT_NOT_AVAILABLE");

    for (const to of ["ACCEPTED", "PREPARING", "READY", "COMPLETED"] as const) {
      await changeOrderStatus(prisma, { orderId: id, to, actorId: user.id });
    }
    const ticket = await api.call("getOrdersByIdDocumentsByType", {
      token,
      path: { id, type: "ticket" },
    });
    expect(ticket.status).toBe(200);
    expect(ticket.headers.get("content-type")).toBe("application/pdf");
    expect(
      Buffer.from(ticket.body as ArrayBuffer)
        .subarray(0, 5)
        .toString(),
    ).toBe("%PDF-");

    const invoice = await api.call("postOrdersByIdInvoice", {
      token,
      path: { id },
      body: { name: "Cliente Flutter S.L.", taxId: "B12345678", address: "Calle Falsa 1, Madrid" },
    });
    expect(invoice.status).toBe(201);
    expect(invoice.body.data.number).toMatch(/^F-\d{4}-\d{6}$/);
    const documents = await api.call("getOrdersByIdDocuments", { token, path: { id } });
    expect(documents.body.data.documents.map((d: { type: string }) => d.type).sort()).toEqual([
      "INVOICE",
      "RECEIPT",
    ]);
  });

  it("starts an online payment: the order waits for payment and the app opens the returned URL", async () => {
    const token = await tokenFor();
    await api.call("patchMe", { token, body: { username: "flutter_3", phone: "+34 600 000 002" } });
    const order = await api.call("postOrders", {
      token,
      headers: { "Idempotency-Key": randomUUID() },
      body: { items: [await firstLine(2)], type: "PICKUP", paymentMethod: "ONLINE" },
    });
    expect(order.body.data.status).toBe("PENDING_PAYMENT");
    const session = await api.call("postOrdersByIdPaymentSession", {
      token,
      path: { id: order.body.data.id },
    });
    expect(session.body.data.url).toMatch(/^https:\/\//);
    // Volver de la página de pago no confirma nada: el pedido sigue pendiente hasta el webhook.
    const after = await api.call("getOrdersById", { token, path: { id: order.body.data.id } });
    expect(after.body.data.status).toBe("PENDING_PAYMENT");
  });

  it("reads and spends FORNEA CLUB points", async () => {
    const token = await tokenFor();
    await api.call("getMe", { token });
    await adjustPoints(prisma, { userId: user.id, actorId: user.id, points: 150, reason: "Alta" });
    const account = await api.call("getLoyaltyAccount", { token });
    expect(account.body.data.balance).toBe(150);
    expect((await api.call("getLoyaltyTransactions", { token })).body.data).toHaveLength(1);
    const rewards = await api.call("getLoyaltyRewards", { token });
    const reward = rewards.body.data.find(
      (item: { pointsCost: number }) => item.pointsCost === 100,
    );
    const redeemed = await api.call("postLoyaltyRedemptions", {
      token,
      body: { rewardId: reward.id },
      headers: { "Idempotency-Key": randomUUID() },
    });
    expect(redeemed.status).toBe(201);
    expect((await api.call("getLoyaltyAccount", { token })).body.data.balance).toBe(50);
    expect((await api.call("getLoyaltyRedemptions", { token })).body.data).toHaveLength(1);
    const poor = await api.call("postLoyaltyRedemptions", {
      token,
      body: { rewardId: reward.id },
      headers: { "Idempotency-Key": randomUUID() },
    });
    expect(poor.status).toBe(409);
    expect(poor.body.error.code).toBe("INSUFFICIENT_POINTS");
  });

  it("talks to the assistant (status first, demo mode if it is not available)", async () => {
    expect((await api.call("getAssistantStatus")).body.data.available).toBe(true);
    const answer = await api.call("postAssistantChat", {
      body: { messages: [{ role: "user", content: "¿Qué pizzas tenéis?" }] },
    });
    expect(answer.body.data.text).toContain("Margherita");
    expect(answer.body.data.links).toEqual([{ label: "Ver la carta", href: "/carta" }]);
  });

  it("covers most of the contract (the rest are staff, kitchen and webhook operations)", () => {
    const { called, total } = api.coverage();
    // Quedan fuera las operaciones del personal, la cocina, el webhook de Stripe y la opción de demostración
    // «hazte administrador» (no existe en un negocio real).
    const consumer = api
      .operationIds()
      .filter((id) => !/^(get|post|put|patch|delete)(Admin|Kitchen|Webhooks)|MeAdminRole/.test(id));
    const missing = consumer.filter((id) => !called.includes(id));
    // Lo que queda sin recorrer es opcional para la app (facturas, descargas, flujos poco habituales).
    expect(missing).toEqual([]);
    expect(called.length).toBeGreaterThanOrEqual(30);
    expect(total).toBeGreaterThan(90);
  });
});
