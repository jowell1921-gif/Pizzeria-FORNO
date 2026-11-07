import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MAX_ADDRESSES } from "../../src/modules/addresses/addresses.service.js";
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

const home = {
  label: "Casa",
  recipientName: "Ana López",
  phone: "+34 600 000 000",
  line1: "Calle Ejemplo 12, 3º B",
  postalCode: "28001",
  city: "Madrid",
};

const create = (headers: Record<string, string>, body: object = home) =>
  request(ctx.app).post("/api/v1/me/addresses").set(headers).send(body);

describe("saved addresses", () => {
  it("requires authentication", async () => {
    expect((await request(ctx.app).get("/api/v1/me/addresses")).status).toBe(401);
    expect((await request(ctx.app).post("/api/v1/me/addresses").send(home)).status).toBe(401);
  });

  it("creates, lists, updates and deletes an address", async () => {
    const { headers } = await ctx.userWithToken();

    const created = await create(headers);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ ...home, isDefault: true, line2: null });

    const list = await request(ctx.app).get("/api/v1/me/addresses").set(headers);
    expect(list.body.data).toHaveLength(1);

    const updated = await request(ctx.app)
      .patch(`/api/v1/me/addresses/${created.body.data.id}`)
      .set(headers)
      .send({ line1: "Calle Nueva 5", notes: "Portero automático" });
    expect(updated.body.data).toMatchObject({
      line1: "Calle Nueva 5",
      notes: "Portero automático",
      city: "Madrid",
    });

    const removed = await request(ctx.app)
      .delete(`/api/v1/me/addresses/${created.body.data.id}`)
      .set(headers);
    expect(removed.status).toBe(204);
    expect((await request(ctx.app).get("/api/v1/me/addresses").set(headers)).body.data).toEqual([]);
  });

  it("makes the first address the default, and moves the default when another is chosen", async () => {
    const { headers } = await ctx.userWithToken();
    const first = (await create(headers)).body.data;
    const second = (await create(headers, { ...home, label: "Trabajo", line1: "Calle Oficina 1" }))
      .body.data;
    expect(first.isDefault).toBe(true);
    expect(second.isDefault).toBe(false);

    const switched = await request(ctx.app)
      .patch(`/api/v1/me/addresses/${second.id}`)
      .set(headers)
      .send({ isDefault: true });
    expect(switched.body.data.isDefault).toBe(true);

    const list = (await request(ctx.app).get("/api/v1/me/addresses").set(headers)).body.data;
    expect(list.filter((address: { isDefault: boolean }) => address.isDefault)).toHaveLength(1);
    expect(list[0].id).toBe(second.id); // la predeterminada va primero
  });

  it("creating a new default address un-defaults the previous one atomically", async () => {
    const { headers } = await ctx.userWithToken();
    await create(headers);
    const chosen = await create(headers, {
      ...home,
      label: "Otra",
      line1: "Calle Otra 9",
      isDefault: true,
    });
    expect(chosen.body.data.isDefault).toBe(true);
    const list = (await request(ctx.app).get("/api/v1/me/addresses").set(headers)).body.data;
    expect(list.filter((address: { isDefault: boolean }) => address.isDefault)).toHaveLength(1);
  });

  it("promotes the oldest remaining address when the default one is deleted", async () => {
    const { headers } = await ctx.userWithToken();
    const first = (await create(headers)).body.data;
    const second = (await create(headers, { ...home, line1: "Calle Dos 2" })).body.data;
    await request(ctx.app).delete(`/api/v1/me/addresses/${first.id}`).set(headers);

    const list = (await request(ctx.app).get("/api/v1/me/addresses").set(headers)).body.data;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: second.id, isDefault: true });
  });

  it("deletes softly (the row is kept, hidden from the user)", async () => {
    const { headers, user } = await ctx.userWithToken();
    const created = (await create(headers)).body.data;
    await request(ctx.app).delete(`/api/v1/me/addresses/${created.id}`).set(headers);
    const row = await prisma.address.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.deletedAt).toBeInstanceOf(Date);
    expect(row.userId).toBe(user.id);
  });

  it(`allows at most ${MAX_ADDRESSES} addresses`, async () => {
    const { headers } = await ctx.userWithToken();
    for (let i = 0; i < MAX_ADDRESSES; i += 1) {
      expect((await create(headers, { ...home, line1: `Calle ${i + 100}` })).status).toBe(201);
    }
    const extra = await create(headers, { ...home, line1: "Calle Extra 1" });
    expect(extra.status).toBe(409);
    expect(extra.body.error.code).toBe("ADDRESS_LIMIT");
  });

  it("validates the fields (postal code, required fields, unknown fields)", async () => {
    const { headers } = await ctx.userWithToken();
    for (const body of [
      { ...home, postalCode: "2800" },
      { ...home, postalCode: "abcde" },
      { ...home, line1: "" },
      { ...home, recipientName: "" },
      { ...home, city: "" },
      { ...home, phone: "abc" },
      { ...home, extra: "no permitido" },
      { ...home, userId: randomUUID() },
      {},
    ]) {
      const response = await create(headers, body);
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    expect(await prisma.address.count()).toBe(0);
  });
});

describe("addresses of other customers are untouchable (isolation)", () => {
  it("never lists another customer's addresses", async () => {
    const ana = await ctx.userWithToken();
    const luis = await ctx.userWithToken();
    await create(ana.headers);
    expect(
      (await request(ctx.app).get("/api/v1/me/addresses").set(luis.headers)).body.data,
    ).toEqual([]);
  });

  it("answers 404 when reading, editing or deleting another customer's address, and changes nothing", async () => {
    const ana = await ctx.userWithToken();
    const luis = await ctx.userWithToken();
    const anaAddress = (await create(ana.headers)).body.data;

    const edit = await request(ctx.app)
      .patch(`/api/v1/me/addresses/${anaAddress.id}`)
      .set(luis.headers)
      .send({ line1: "Hackeada 1" });
    expect(edit.status).toBe(404);
    const remove = await request(ctx.app)
      .delete(`/api/v1/me/addresses/${anaAddress.id}`)
      .set(luis.headers);
    expect(remove.status).toBe(404);

    const stored = await prisma.address.findUniqueOrThrow({ where: { id: anaAddress.id } });
    expect(stored.line1).toBe(home.line1);
    expect(stored.deletedAt).toBeNull();
  });

  it("cannot be tricked into creating an address for someone else", async () => {
    const ana = await ctx.userWithToken();
    const luis = await ctx.userWithToken();
    const response = await create(ana.headers, { ...home, userId: luis.user.id });
    expect(response.status).toBe(400);

    const created = await create(ana.headers);
    const stored = await prisma.address.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(stored.userId).toBe(ana.user.id);
  });

  it("a default address of one customer does not affect another's default", async () => {
    const ana = await ctx.userWithToken();
    const luis = await ctx.userWithToken();
    const anaAddress = (await create(ana.headers)).body.data;
    const luisAddress = (await create(luis.headers)).body.data;
    expect(anaAddress.isDefault).toBe(true);
    expect(luisAddress.isDefault).toBe(true);
  });

  it("rejects malformed ids with a 404", async () => {
    const { headers } = await ctx.userWithToken();
    expect(
      (await request(ctx.app).patch("/api/v1/me/addresses/abc").set(headers).send({ city: "X" }))
        .status,
    ).toBe(404);
    expect((await request(ctx.app).delete("/api/v1/me/addresses/abc").set(headers)).status).toBe(
      404,
    );
  });
});
