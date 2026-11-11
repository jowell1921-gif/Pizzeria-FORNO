import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedDemoData } from "../../prisma/seed-demo-data.js";
import { Prisma } from "../../src/db/client.js";
import { taxBreakdown } from "../../src/modules/documents/invoice.service.js";
import { changeOrderStatus } from "../../src/modules/orders/status.service.js";
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
  await prisma.openingHours.deleteMany();
  await prisma.openingHours.createMany({
    data: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
      dayOfWeek,
      openMinute: 0,
      closeMinute: 1440,
    })),
  });
});

const api = () => request(ctx.app);

async function line(slug = "margherita", quantity = 1) {
  const product = await prisma.product.findFirstOrThrow({
    where: { slug },
    include: { optionGroups: { include: { options: true } } },
  });
  const optionIds = product.optionGroups
    .filter((group) => group.required)
    .flatMap((group) =>
      group.options.filter((option) => option.isDefault).map((option) => option.id),
    );
  return { productId: product.id, quantity, optionIds };
}

async function customer() {
  return ctx.userWithToken({
    username: `cli${randomUUID().slice(0, 5)}`,
    phone: "+34 600 000 000",
  });
}

async function cashOrder(
  who: Awaited<ReturnType<typeof customer>>,
  type: "PICKUP" | "DELIVERY" = "PICKUP",
) {
  const address =
    type === "DELIVERY"
      ? await prisma.address.create({
          data: {
            userId: who.user.id,
            recipientName: "Cliente",
            line1: "Calle Mayor 1",
            postalCode: "28001",
            city: "Madrid",
            isDefault: true,
          },
        })
      : null;
  const response = await api()
    .post("/api/v1/orders")
    .set(who.headers)
    .set("Idempotency-Key", randomUUID())
    .send({
      items: [await line("margherita", 3)],
      type,
      ...(address ? { addressId: address.id } : {}),
      paymentMethod: type === "PICKUP" ? "CASH_PICKUP" : "CASH_DELIVERY",
    });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

async function complete(orderId: string, actorId: string) {
  for (const to of ["ACCEPTED", "PREPARING", "READY", "COMPLETED"] as const) {
    await changeOrderStatus(prisma, { orderId, to, actorId });
  }
}

const binary = (res: request.Response) =>
  new Promise<Buffer>((resolve) => {
    resolve(Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.text ?? ""));
  });

function getPdf(path: string, headers: Record<string, string>) {
  return api()
    .get(path)
    .set(headers)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
    });
}

describe("tax breakdown", () => {
  const decimal = (value: string) => new Prisma.Decimal(value);

  it("adds up exactly to the tax of the order, by rate, including discounts and delivery", () => {
    const breakdown = taxBreakdown({
      items: [
        { lineTotal: decimal("11.00"), taxRate: decimal("10.00") },
        { lineTotal: decimal("5.00"), taxRate: decimal("21.00") },
      ],
      discountTotal: decimal("1.60"),
      deliveryFee: decimal("2.50"),
    });
    expect(breakdown.map((row) => row.rate)).toEqual(["10.00", "21.00"]);
    const base = breakdown.reduce((sum, row) => sum.add(row.base), decimal("0"));
    const tax = breakdown.reduce((sum, row) => sum.add(row.tax), decimal("0"));
    // Total pagado = 11 + 5 - 1,60 + 2,50 = 16,90
    expect(base.add(tax).toFixed(2)).toBe("16.90");
  });

  it("matches the tax stored in real orders", async () => {
    const who = await customer();
    const id = await cashOrder(who, "DELIVERY");
    const order = await prisma.order.findUniqueOrThrow({ where: { id }, include: { items: true } });
    const tax = taxBreakdown(order).reduce((sum, row) => sum.add(row.tax), decimal0());
    expect(tax.toFixed(2)).toBe(order.taxTotal.toFixed(2));
  });
});
const decimal0 = () => new Prisma.Decimal(0);

describe("tickets", () => {
  it("are not available until the order is paid, then they are PDF with a consecutive number", async () => {
    const who = await customer();
    const id = await cashOrder(who);

    const early = await api().get(`/api/v1/orders/${id}/documents/ticket`).set(who.headers);
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("DOCUMENT_NOT_AVAILABLE");
    expect((await api().get(`/api/v1/orders/${id}/documents`).set(who.headers)).body.data).toEqual({
      settled: false,
      documents: [],
    });

    await complete(id, who.user.id);
    const pdf = await getPdf(`/api/v1/orders/${id}/documents/ticket`, who.headers);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.headers["content-disposition"]).toMatch(/attachment; filename="ticket-\d+\.pdf"/);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");

    const year = new Date().getFullYear();
    const listed = await api().get(`/api/v1/orders/${id}/documents`).set(who.headers);
    expect(listed.body.data.documents).toEqual([
      expect.objectContaining({ type: "RECEIPT", number: `T-${year}-000001` }),
    ]);

    // Pedir el ticket otra vez no emite otro.
    await getPdf(`/api/v1/orders/${id}/documents/ticket`, who.headers);
    expect(await prisma.invoice.count()).toBe(1);
  });

  it("are numbered without gaps or duplicates even when requested at the same time", async () => {
    const who = await customer();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = await cashOrder(who);
      await complete(id, who.user.id);
      ids.push(id);
    }
    const results = await Promise.all(
      ids.map((id) => getPdf(`/api/v1/orders/${id}/documents/ticket`, who.headers)),
    );
    expect(results.every((res) => res.status === 200)).toBe(true);
    const numbers = (await prisma.invoice.findMany({ orderBy: { number: "asc" } })).map(
      (i) => i.number,
    );
    expect(numbers).toEqual([1, 2, 3, 4, 5]);
    expect((await prisma.invoiceSequence.findFirstOrThrow()).lastNumber).toBe(5);
  });

  it("belong to their owner: another customer gets 404, and the staff can download them", async () => {
    const who = await customer();
    const id = await cashOrder(who);
    await complete(id, who.user.id);
    const stranger = await customer();
    expect((await getPdf(`/api/v1/orders/${id}/documents/ticket`, stranger.headers)).status).toBe(
      404,
    );
    expect((await api().get(`/api/v1/orders/${id}/documents`).set(stranger.headers)).status).toBe(
      404,
    );
    expect((await api().get(`/api/v1/orders/${id}/documents/ticket`)).status).toBe(401);

    const admin = await ctx.userWithToken({ username: "admin_1", phone: "+34 600 000 001" });
    await prisma.userRole.create({ data: { userId: admin.user.id, role: "STAFF" } });
    const asStaff = await getPdf(`/api/v1/admin/orders/${id}/documents/ticket`, admin.headers);
    expect(asStaff.status).toBe(200);
    expect(
      (await getPdf(`/api/v1/admin/orders/${id}/documents/ticket`, stranger.headers)).status,
    ).toBe(403);
  });

  it("rejects unknown document types", async () => {
    const who = await customer();
    const id = await cashOrder(who);
    expect((await api().get(`/api/v1/orders/${id}/documents/otro`).set(who.headers)).status).toBe(
      400,
    );
  });
});

describe("invoices", () => {
  const data = {
    name: "Panadería Ejemplo S.L.",
    taxId: "b12345678",
    address: "Calle Falsa 123, 28001 Madrid",
  };

  it("are issued only on request, with the customer's tax data, in their own series", async () => {
    const who = await customer();
    const id = await cashOrder(who);
    await complete(id, who.user.id);
    const post = (body: object, headers = who.headers) =>
      api().post(`/api/v1/orders/${id}/invoice`).set(headers).send(body);

    expect((await getPdf(`/api/v1/orders/${id}/documents/invoice`, who.headers)).status).toBe(404);
    expect((await post({ name: "A", taxId: "x", address: "y" })).status).toBe(400);
    expect((await post({ ...data, extra: true })).status).toBe(400);

    const created = await post(data);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      type: "INVOICE",
      number: `F-${new Date().getFullYear()}-000001`,
    });
    const stored = await prisma.invoice.findFirstOrThrow({ where: { type: "INVOICE" } });
    expect(stored).toMatchObject({ customerName: data.name, customerTaxId: "B12345678" });

    // Pedirla otra vez devuelve la misma.
    expect((await post(data)).body.data.number).toBe(created.body.data.number);
    expect(await prisma.invoice.count({ where: { type: "INVOICE" } })).toBe(1);

    const pdf = await getPdf(`/api/v1/orders/${id}/documents/invoice`, who.headers);
    expect(pdf.status).toBe(200);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
    expect((await post(data, (await customer()).headers)).status).toBe(404);
  });

  it("cannot be requested before the order is paid", async () => {
    const who = await customer();
    const id = await cashOrder(who);
    const res = await api().post(`/api/v1/orders/${id}/invoice`).set(who.headers).send(data);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DOCUMENT_NOT_AVAILABLE");
  });

  it("cannot be changed or deleted once issued (database rule)", async () => {
    const who = await customer();
    const id = await cashOrder(who);
    await complete(id, who.user.id);
    await getPdf(`/api/v1/orders/${id}/documents/ticket`, who.headers);
    const invoice = await prisma.invoice.findFirstOrThrow();
    await expect(
      prisma.invoice.update({
        where: { id: invoice.id },
        data: { total: new Prisma.Decimal("1.00") },
      }),
    ).rejects.toThrow();
    await expect(prisma.invoice.delete({ where: { id: invoice.id } })).rejects.toThrow();
  });
});

void binary;
