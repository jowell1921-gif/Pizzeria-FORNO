import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedDemoData } from "../../prisma/seed-demo-data.js";
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

const api = () => request(ctx.app);

async function withRole(role: "ADMIN" | "STAFF" | "KITCHEN") {
  const current = await ctx.userWithToken({ username: `u_${role}`, phone: "+34 600 000 001" });
  await prisma.userRole.create({ data: { userId: current.user.id, role } });
  return current;
}

const paths = [
  "/api/v1/admin/store/settings",
  "/api/v1/admin/store/opening-hours",
  "/api/v1/admin/store/special-days",
  "/api/v1/admin/delivery-zones",
];

describe("access control", () => {
  it("requires settings:manage", async () => {
    for (const path of paths) expect((await api().get(path)).status, path).toBe(401);
    for (const role of ["STAFF", "KITCHEN"] as const) {
      const { headers } = await withRole(role);
      for (const path of paths)
        expect((await api().get(path).set(headers)).status, `${role} ${path}`).toBe(403);
      expect((await api().patch(paths[0]!).set(headers).send({ ordersPaused: true })).status).toBe(
        403,
      );
    }
    const customer = await ctx.userWithToken();
    expect((await api().get(paths[0]!).set(customer.headers)).status).toBe(403);
    const admin = await withRole("ADMIN");
    for (const path of paths)
      expect((await api().get(path).set(admin.headers)).status, path).toBe(200);
  });
});

describe("store settings", () => {
  it("edits the store data, the times and the payment methods, and the public API follows", async () => {
    const { user, headers } = await withRole("ADMIN");
    const response = await api()
      .patch("/api/v1/admin/store/settings")
      .set(headers)
      .send({
        name: "FORNO Centro",
        phone: "+34 911 222 333",
        prepTimeMinutes: 25,
        deliveryTimeMinutes: 50,
        slotMinutes: 30,
        maxAdvanceDays: 5,
        enabledPaymentMethods: ["CASH_PICKUP", "CASH_DELIVERY"],
      });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      name: "FORNO Centro",
      prepTimeMinutes: 25,
      slotMinutes: 30,
      enabledPaymentMethods: ["CASH_PICKUP", "CASH_DELIVERY"],
    });

    const publicView = (await api().get("/api/v1/store/settings")).body.data;
    expect(publicView).toMatchObject({
      name: "FORNO Centro",
      prepTimeMinutes: 25,
      deliveryTimeMinutes: 50,
      maxAdvanceDays: 5,
    });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "store.update" } });
    expect(audit).toMatchObject({ actorId: user.id, entityType: "StoreSettings" });
    expect(audit.before).toMatchObject({ name: "FORNO", prepTimeMinutes: 20 });
    expect(audit.after).toMatchObject({ name: "FORNO Centro", prepTimeMinutes: 25 });
  });

  it("pauses and resumes orders; a paused store rejects new orders with its message", async () => {
    const { headers } = await withRole("ADMIN");
    const customer = await ctx.userWithToken({ username: "cliente1", phone: "+34 600 000 002" });
    const product = await prisma.product.findFirstOrThrow({ where: { slug: "agua" } });
    const order = () =>
      api()
        .post("/api/v1/orders")
        .set(customer.headers)
        .set("Idempotency-Key", randomUUID())
        .send({
          items: [{ productId: product.id, quantity: 1, optionIds: [] }],
          type: "PICKUP",
          paymentMethod: "CASH_PICKUP",
        });

    await prisma.openingHours.deleteMany();
    await prisma.openingHours.createMany({
      data: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
        dayOfWeek,
        openMinute: 0,
        closeMinute: 1440,
      })),
    });

    await api()
      .patch("/api/v1/admin/store/settings")
      .set(headers)
      .send({ ordersPaused: true, pausedMessage: "Volvemos en 15 minutos" });
    const paused = await order();
    expect(paused.status).toBe(409);
    expect(paused.body.error).toMatchObject({
      code: "ORDERS_PAUSED",
      message: "Volvemos en 15 minutos",
    });
    expect((await api().get("/api/v1/store/settings")).body.data).toMatchObject({
      ordersPaused: true,
    });
    expect(
      (await prisma.auditLog.findFirstOrThrow({ where: { action: "store.pause" } })).after,
    ).toMatchObject({ ordersPaused: true, pausedMessage: "Volvemos en 15 minutos" });

    await api().patch("/api/v1/admin/store/settings").set(headers).send({ ordersPaused: false });
    expect((await order()).status).toBe(201);
  });

  it("validates every field and refuses to disable both order types", async () => {
    const { headers } = await withRole("ADMIN");
    const patch = (body: object) =>
      api().patch("/api/v1/admin/store/settings").set(headers).send(body);
    for (const body of [
      {},
      { prepTimeMinutes: 0 },
      { prepTimeMinutes: 500 },
      { prepTimeMinutes: "20" },
      { slotMinutes: 7 },
      { maxAdvanceDays: 40 },
      { postalCode: "123" },
      { email: "no-es-un-correo" },
      { timezone: "Marte/Olimpo" },
      { enabledPaymentMethods: [] },
      { enabledPaymentMethods: ["BITCOIN"] },
      { loyaltyPointsPerEuro: "5" },
      { currency: "USD" },
    ]) {
      expect((await patch(body)).status, JSON.stringify(body)).toBe(400);
    }
    await patch({ pickupEnabled: false });
    const both = await patch({ deliveryEnabled: false });
    expect(both.status).toBe(422);
    expect(both.body.error.code).toBe("NO_ORDER_TYPE");
    expect((await api().get("/api/v1/store/settings")).body.data).toMatchObject({
      pickupEnabled: false,
      deliveryEnabled: true,
    });
  });
});

describe("opening hours", () => {
  it("replaces the weekly schedule and the public 'open' flag follows it", async () => {
    const { headers } = await withRole("ADMIN");
    const current = await api().get("/api/v1/admin/store/opening-hours").set(headers);
    expect(current.body.data.filter((slot: { dayOfWeek: number }) => slot.dayOfWeek === 1)).toEqual(
      [],
    ); // el lunes cierra

    const allDay = [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
      dayOfWeek,
      openMinute: 0,
      closeMinute: 1440,
    }));
    const saved = await api()
      .put("/api/v1/admin/store/opening-hours")
      .set(headers)
      .send({ slots: allDay });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toHaveLength(7);
    expect((await api().get("/api/v1/store/settings")).body.data.open).toBe(true);

    await api().put("/api/v1/admin/store/opening-hours").set(headers).send({ slots: [] });
    expect((await api().get("/api/v1/store/settings")).body.data.open).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: "store.opening-hours" } })).toBe(2);
  });

  it("rejects invalid or overlapping hours", async () => {
    const { headers } = await withRole("ADMIN");
    const put = (slots: unknown[]) =>
      api().put("/api/v1/admin/store/opening-hours").set(headers).send({ slots });
    expect((await put([{ dayOfWeek: 8, openMinute: 600, closeMinute: 700 }])).status).toBe(400);
    expect((await put([{ dayOfWeek: 1, openMinute: 700, closeMinute: 600 }])).status).toBe(400);
    expect((await put([{ dayOfWeek: 1, openMinute: 600, closeMinute: 600 }])).status).toBe(400);
    expect((await put([{ dayOfWeek: 1, openMinute: 0, closeMinute: 1500 }])).status).toBe(400);
    expect(
      (
        await put([
          { dayOfWeek: 1, openMinute: 600, closeMinute: 900 },
          { dayOfWeek: 1, openMinute: 800, closeMinute: 1000 },
        ])
      ).status,
    ).toBe(400);
    // Dos tramos del mismo día que no se solapan sí valen (comida y cena).
    expect(
      (
        await put([
          { dayOfWeek: 1, openMinute: 780, closeMinute: 960 },
          { dayOfWeek: 1, openMinute: 1200, closeMinute: 1380 },
        ])
      ).status,
    ).toBe(200);
    // Una petición inválida no deja el horario a medias.
    expect(
      (await api().get("/api/v1/admin/store/opening-hours").set(headers)).body.data,
    ).toHaveLength(2);
  });
});

describe("special days", () => {
  it("closes a holiday, sets special hours and removes them", async () => {
    const { headers } = await withRole("ADMIN");
    const closed = await api()
      .post("/api/v1/admin/store/special-days")
      .set(headers)
      .send({ date: "2099-12-25", closed: true, note: "Navidad" });
    expect(closed.status).toBe(201);
    expect(closed.body.data).toMatchObject({
      date: "2099-12-25",
      closed: true,
      openMinute: null,
      note: "Navidad",
    });
    const special = await api()
      .post("/api/v1/admin/store/special-days")
      .set(headers)
      .send({ date: "2099-12-31", closed: false, openMinute: 780, closeMinute: 960 });
    expect(special.body.data).toMatchObject({ closed: false, openMinute: 780, closeMinute: 960 });

    const publicDays = (await api().get("/api/v1/store/settings")).body.data.specialDays;
    expect(publicDays.map((day: { date: string }) => day.date)).toEqual([
      "2099-12-25",
      "2099-12-31",
    ]);

    expect(
      (
        await api()
          .post("/api/v1/admin/store/special-days")
          .set(headers)
          .send({ date: "2099-12-25", closed: true })
      ).status,
    ).toBe(409);
    expect(
      (await api().delete(`/api/v1/admin/store/special-days/${closed.body.data.id}`).set(headers))
        .status,
    ).toBe(204);
    expect(
      (await api().delete(`/api/v1/admin/store/special-days/${closed.body.data.id}`).set(headers))
        .status,
    ).toBe(404);
    expect(
      (await api().get("/api/v1/admin/store/special-days").set(headers)).body.data,
    ).toHaveLength(1);
  });

  it("validates dates and hours", async () => {
    const { headers } = await withRole("ADMIN");
    const post = (body: object) =>
      api().post("/api/v1/admin/store/special-days").set(headers).send(body);
    for (const body of [
      { date: "25/12/2099", closed: true },
      { date: "2099-13-45", closed: true },
      { date: "2099-12-25", closed: true, openMinute: 600 },
      { date: "2099-12-25", closed: false },
      { date: "2099-12-25", closed: false, openMinute: 900, closeMinute: 800 },
    ]) {
      expect((await post(body)).status, JSON.stringify(body)).toBe(400);
    }
  });
});

describe("delivery zones", () => {
  it("creates, edits, disables and deletes zones, and the public check follows", async () => {
    const { headers } = await withRole("ADMIN");
    const created = await api()
      .post("/api/v1/admin/delivery-zones")
      .set(headers)
      .send({
        name: "Sur",
        postalCodes: ["28040", "28041"],
        deliveryFee: "4.00",
        minimumOrder: "18.00",
        estimatedMinutes: 55,
      });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ name: "Sur", deliveryFee: "4.00", active: true });

    const check = await api().get("/api/v1/delivery-zones/check?postalCode=28040");
    expect(check.body.data).toMatchObject({
      covered: true,
      zone: { name: "Sur", deliveryFee: "4.00", minimumOrder: "18.00" },
    });

    const edited = await api()
      .patch(`/api/v1/admin/delivery-zones/${created.body.data.id}`)
      .set(headers)
      .send({ deliveryFee: "3.00", postalCodes: ["28040", "28042"] });
    expect(edited.body.data).toMatchObject({
      deliveryFee: "3.00",
      postalCodes: ["28040", "28042"],
    });
    expect(
      (await api().get("/api/v1/delivery-zones/check?postalCode=28041")).body.data.covered,
    ).toBe(false);

    await api()
      .patch(`/api/v1/admin/delivery-zones/${created.body.data.id}`)
      .set(headers)
      .send({ active: false });
    expect(
      (await api().get("/api/v1/delivery-zones/check?postalCode=28040")).body.data.covered,
    ).toBe(false);

    expect(
      (await api().delete(`/api/v1/admin/delivery-zones/${created.body.data.id}`).set(headers))
        .status,
    ).toBe(204);
    expect((await api().get("/api/v1/admin/delivery-zones").set(headers)).body.data).toHaveLength(
      2,
    );
    const actions = (
      await prisma.auditLog.findMany({
        where: { entityType: "DeliveryZone" },
        orderBy: { createdAt: "asc" },
      })
    ).map((entry) => entry.action);
    expect(actions).toEqual(["zone.create", "zone.update", "zone.update", "zone.delete"]);
  });

  it("never lets a postal code belong to two active zones", async () => {
    const { headers } = await withRole("ADMIN");
    const clash = await api()
      .post("/api/v1/admin/delivery-zones")
      .set(headers)
      .send({
        name: "Duplicada",
        postalCodes: ["28001"],
        deliveryFee: "1.00",
        minimumOrder: "0.00",
        estimatedMinutes: 30,
      });
    expect(clash.status).toBe(422);
    expect(clash.body.error.code).toBe("POSTAL_CODE_IN_USE");

    const north = await prisma.deliveryZone.findFirstOrThrow({
      where: { name: { startsWith: "Norte" } },
    });
    const move = await api()
      .patch(`/api/v1/admin/delivery-zones/${north.id}`)
      .set(headers)
      .send({ postalCodes: ["28010", "28002"] });
    expect(move.status).toBe(422);
    // Una zona inactiva no bloquea sus códigos.
    const created = await api()
      .post("/api/v1/admin/delivery-zones")
      .set(headers)
      .send({
        name: "Reserva",
        postalCodes: ["28001"],
        deliveryFee: "1.00",
        minimumOrder: "0.00",
        estimatedMinutes: 30,
        active: false,
      });
    expect(created.status).toBe(201);
    const activate = await api()
      .patch(`/api/v1/admin/delivery-zones/${created.body.data.id}`)
      .set(headers)
      .send({ active: true });
    expect(activate.status).toBe(422);
  });

  it("validates amounts, postal codes and unknown fields", async () => {
    const { headers } = await withRole("ADMIN");
    const base = {
      name: "Zona",
      postalCodes: ["28050"],
      deliveryFee: "2.00",
      minimumOrder: "10.00",
      estimatedMinutes: 30,
    };
    const post = (changes: object) =>
      api()
        .post("/api/v1/admin/delivery-zones")
        .set(headers)
        .send({ ...base, ...changes });
    for (const changes of [
      { name: "x" },
      { postalCodes: [] },
      { postalCodes: ["2805"] },
      { postalCodes: ["abcde"] },
      { deliveryFee: "-1.00" },
      { deliveryFee: 2 },
      { minimumOrder: "1,5" },
      { estimatedMinutes: 0 },
      { id: randomUUID() },
    ]) {
      expect((await post(changes)).status, JSON.stringify(changes)).toBe(400);
    }
    expect(
      (
        await api()
          .patch(`/api/v1/admin/delivery-zones/${randomUUID()}`)
          .set(headers)
          .send({ name: "Nada" })
      ).status,
    ).toBe(404);
    expect((await api().delete("/api/v1/admin/delivery-zones/no-uuid").set(headers)).status).toBe(
      404,
    );
  });
});
