import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedDemoData } from "../../prisma/seed-demo-data.js";
import { createApp } from "../../src/app.js";
import { createTestClient, createUser, resetDatabase, type PrismaClient } from "../db/helpers.js";
import { createTestAuth } from "../helpers/auth.js";

const OWNER = "dueno@ejemplo.test";

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
  await prisma.openingHours.deleteMany();
  await prisma.openingHours.createMany({
    data: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
      dayOfWeek,
      openMinute: 0,
      closeMinute: 1440,
    })),
  });
});

const api = () => request(app);
let counter = 0;

/** Administrador (como los visitantes de la demostración) con su sesión. */
async function admin(email: string) {
  const user = await createUser(prisma, {
    email,
    username: `u_${randomUUID().slice(0, 8)}`,
    phone: `+34 600 000 ${String(++counter).padStart(3, "0")}`,
  });
  await prisma.userRole.create({ data: { userId: user.id, role: "ADMIN" } });
  const token = await auth.sign({ sub: user.id, email: user.email });
  return { id: user.id, headers: { Authorization: `Bearer ${token}` } };
}

async function cashOrder(who: Awaited<ReturnType<typeof admin>>) {
  const product = await prisma.product.findFirstOrThrow({
    where: { slug: "margherita" },
    include: { optionGroups: { include: { options: true } } },
  });
  const optionIds = product.optionGroups
    .filter((group) => group.required)
    .flatMap((group) =>
      group.options.filter((option) => option.isDefault).map((option) => option.id),
    );
  const response = await api()
    .post("/api/v1/orders")
    .set(who.headers)
    .set("Idempotency-Key", randomUUID())
    .send({
      items: [{ productId: product.id, quantity: 1, optionIds }],
      type: "PICKUP",
      paymentMethod: "CASH_PICKUP",
    });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

describe("demo visitors only see their own orders", () => {
  it("lists, opens and changes only the orders they made, and the owner sees everyone's", async () => {
    const juan = await admin("juan@ejemplo.test");
    const pedro = await admin("pedro@ejemplo.test");
    const owner = await admin(OWNER);
    const juanOrder = await cashOrder(juan);
    const pedroOrder = await cashOrder(pedro);

    const ids = async (who: typeof juan) =>
      (await api().get("/api/v1/admin/orders").set(who.headers)).body.data.map(
        (order: { id: string }) => order.id,
      );
    expect(await ids(juan)).toEqual([juanOrder]);
    expect(await ids(pedro)).toEqual([pedroOrder]);
    expect((await ids(owner)).sort()).toEqual([juanOrder, pedroOrder].sort());

    // El pedido de otra persona responde como si no existiera, en todas las operaciones.
    for (const response of [
      await api().get(`/api/v1/admin/orders/${pedroOrder}`).set(juan.headers),
      await api()
        .patch(`/api/v1/admin/orders/${pedroOrder}/status`)
        .set(juan.headers)
        .send({ status: "ACCEPTED" }),
      await api().get(`/api/v1/admin/orders/${pedroOrder}/documents/ticket`).set(juan.headers),
      await api()
        .post(`/api/v1/admin/orders/${pedroOrder}/refund`)
        .set(juan.headers)
        .send({ reason: "prueba" }),
    ]) {
      expect(response.status).toBe(404);
    }
    expect((await prisma.order.findUniqueOrThrow({ where: { id: pedroOrder } })).status).toBe(
      "NEW",
    );

    // Con el suyo sí puede trabajar.
    const own = await api()
      .patch(`/api/v1/admin/orders/${juanOrder}/status`)
      .set(juan.headers)
      .send({ status: "ACCEPTED" });
    expect(own.status).toBe(200);
    expect(own.body.data.status).toBe("ACCEPTED");
  });

  it("limits the dashboard to their own orders", async () => {
    const juan = await admin("juan@ejemplo.test");
    const pedro = await admin("pedro@ejemplo.test");
    const owner = await admin(OWNER);
    await cashOrder(juan);
    await cashOrder(pedro);
    await cashOrder(pedro);

    const total = async (who: typeof juan) =>
      (await api().get("/api/v1/admin/dashboard").set(who.headers)).body.data.orders.total;
    expect(await total(juan)).toBe(1);
    expect(await total(pedro)).toBe(2);
    expect(await total(owner)).toBe(3);
  });

  it("limits the kitchen screen and its actions to their own orders", async () => {
    const juan = await admin("juan@ejemplo.test");
    const pedro = await admin("pedro@ejemplo.test");
    const owner = await admin(OWNER);
    const juanOrder = await cashOrder(juan);
    const pedroOrder = await cashOrder(pedro);

    const kitchen = async (who: typeof juan) =>
      (await api().get("/api/v1/kitchen/orders").set(who.headers)).body.data.map(
        (order: { id: string }) => order.id,
      );
    expect(await kitchen(juan)).toEqual([juanOrder]);
    expect((await kitchen(owner)).sort()).toEqual([juanOrder, pedroOrder].sort());

    const foreign = await api()
      .patch(`/api/v1/kitchen/orders/${pedroOrder}/status`)
      .set(juan.headers)
      .send({ status: "ACCEPTED" });
    expect(foreign.status).toBe(404);
    const own = await api()
      .patch(`/api/v1/kitchen/orders/${juanOrder}/status`)
      .set(juan.headers)
      .send({ status: "ACCEPTED" });
    expect(own.status).toBe(200);
  });

  it("does not show other people's e-mails, points or customer list", async () => {
    const juan = await admin("juan@ejemplo.test");
    const pedro = await admin("pedro@ejemplo.test");
    const owner = await admin(OWNER);
    const pedroOrder = await cashOrder(pedro);
    await prisma.notificationLog.create({
      data: {
        orderId: pedroOrder,
        template: "ORDER_CONFIRMED",
        recipient: pedro.id.slice(0, 8) + "@ejemplo.test",
        subject: "Pedido recibido",
        bodyText: "texto",
        bodyHtml: "<p>texto</p>",
        status: "LOGGED",
      },
    });

    const mails = async (who: typeof juan) =>
      (await api().get("/api/v1/admin/notifications").set(who.headers)).body.data.length;
    expect(await mails(juan)).toBe(0);
    expect(await mails(pedro)).toBe(1);
    expect(await mails(owner)).toBe(1);

    // La lista de clientes (datos personales de todos) es solo del propietario.
    expect((await api().get("/api/v1/admin/customers").set(juan.headers)).status).toBe(403);
    expect((await api().get("/api/v1/admin/customers").set(owner.headers)).status).toBe(200);
    // Movimientos y canjes de puntos: solo los suyos.
    const movements = await api().get("/api/v1/admin/loyalty/transactions").set(juan.headers);
    expect(movements.status).toBe(200);
    for (const row of movements.body.data) expect(row.customer.id).toBe(juan.id);
  });

  it("does not restrict real staff or kitchen users: they work with every order", async () => {
    const juan = await admin("juan@ejemplo.test");
    const juanOrder = await cashOrder(juan);
    const pedro = await admin("pedro@ejemplo.test");
    const pedroOrder = await cashOrder(pedro);
    for (const role of ["STAFF", "KITCHEN"] as const) {
      const worker = await admin(`${role.toLowerCase()}@ejemplo.test`);
      // Se le cambia el rol de administrador por el de personal o cocina.
      await prisma.userRole.deleteMany({ where: { userId: worker.id } });
      await prisma.userRole.create({ data: { userId: worker.id, role } });
      const kitchen = await api().get("/api/v1/kitchen/orders").set(worker.headers);
      expect(kitchen.body.data.map((order: { id: string }) => order.id).sort()).toEqual(
        [juanOrder, pedroOrder].sort(),
      );
      const profile = await api().get("/api/v1/me").set(worker.headers);
      expect(profile.body.data.ownDataOnly).toBe(false);
    }
    // El personal además sigue viendo la lista de clientes.
    const staff = await prisma.profile.findFirstOrThrow({ where: { email: "staff@ejemplo.test" } });
    const staffToken = await auth.sign({ sub: staff.id, email: staff.email });
    const customers = await api()
      .get("/api/v1/admin/customers")
      .set({ Authorization: `Bearer ${staffToken}` });
    expect(customers.status).toBe(200);
  });

  it("tells the web which mode it is in", async () => {
    const juan = await admin("juan@ejemplo.test");
    const owner = await admin(OWNER);
    expect((await api().get("/api/v1/me").set(juan.headers)).body.data.ownDataOnly).toBe(true);
    expect((await api().get("/api/v1/me").set(owner.headers)).body.data.ownDataOnly).toBe(false);
  });
});
