import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { USERNAME_MAX } from "../../src/modules/me/me.service.js";
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

const patch = (headers: Record<string, string>, body: unknown) =>
  request(ctx.app)
    .patch("/api/v1/me")
    .set(headers)
    .send(body as object);

describe("user name and phone", () => {
  it("starts incomplete: no username and no phone", async () => {
    const { headers } = await ctx.userWithToken();
    const response = await request(ctx.app).get("/api/v1/me").set(headers);
    expect(response.body.data).toMatchObject({
      username: null,
      phone: null,
      profileComplete: false,
    });
  });

  it("becomes complete once both the username and the phone are saved", async () => {
    const { headers } = await ctx.userWithToken();

    const onlyName = await patch(headers, { username: "ana_lopez" });
    expect(onlyName.body.data).toMatchObject({ username: "ana_lopez", profileComplete: false });

    const both = await patch(headers, { phone: "+34 600 000 000" });
    expect(both.body.data).toMatchObject({
      username: "ana_lopez",
      phone: "+34 600 000 000",
      profileComplete: true,
    });
  });

  it(`accepts usernames of 3 to ${USERNAME_MAX} characters, including accents and . _ -`, async () => {
    const { headers } = await ctx.userWithToken();
    for (const username of ["Ana", "María", "ana.lopez", "ana-lopez_1", "a".repeat(USERNAME_MAX)]) {
      const response = await patch(headers, { username });
      expect(response.status, username).toBe(200);
      expect(response.body.data.username).toBe(username);
    }
  });

  it(`rejects usernames shorter than 3 or longer than ${USERNAME_MAX} characters`, async () => {
    const { headers } = await ctx.userWithToken();
    for (const username of ["", "ab", "a".repeat(USERNAME_MAX + 1), "x".repeat(40)]) {
      const response = await patch(headers, { username });
      expect(response.status, JSON.stringify(username)).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
    const profile = await prisma.profile.findFirstOrThrow();
    expect(profile.username).toBeNull();
  });

  it("rejects usernames with spaces, symbols or markup", async () => {
    const { headers } = await ctx.userWithToken();
    for (const username of [
      "ana lopez",
      "ana@lopez",
      "<b>ana</b>",
      "ana;drop",
      "ana/lopez",
      "ana😀",
    ]) {
      expect((await patch(headers, { username })).status, username).toBe(400);
    }
  });

  it("trims whitespace around the username", async () => {
    const { headers } = await ctx.userWithToken();
    const response = await patch(headers, { username: "  ana_lopez  " });
    expect(response.body.data.username).toBe("ana_lopez");
  });

  it("rejects invalid phone numbers and does not allow clearing the phone", async () => {
    const { headers } = await ctx.userWithToken();
    for (const phone of ["abc", "12", "+34 600 000 000 000 000 000", "600-ABC-123"]) {
      expect((await patch(headers, { phone })).status, phone).toBe(400);
    }
    await patch(headers, { phone: "600 000 000" });
    expect((await patch(headers, { phone: null })).status).toBe(400);
    expect((await patch(headers, { phone: "" })).status).toBe(400);
    const profile = await prisma.profile.findFirstOrThrow();
    expect(profile.phone).toBe("600 000 000");
  });

  it("is enforced by the database too, not only by the API", async () => {
    const { user } = await ctx.userWithToken();
    await expect(
      prisma.profile.update({ where: { id: user.id }, data: { username: "ab" } }),
    ).rejects.toThrow(/ck_profile_username/);
    await expect(
      prisma.profile.update({ where: { id: user.id }, data: { phone: "no es un teléfono" } }),
    ).rejects.toThrow(/ck_profile_phone_format/);
  });
});

describe("loyalty account creation", () => {
  it("creates the points account (at zero) together with the profile, on the very first request of a brand new user", async () => {
    const { sign } = ctx.auth;
    const token = await sign({ email: "nuevo@example.test" });
    const response = await request(ctx.app)
      .get("/api/v1/me")
      .set({ Authorization: `Bearer ${token}` });
    expect(response.status).toBe(200);

    const profile = await prisma.profile.findUniqueOrThrow({
      where: { email: "nuevo@example.test" },
      include: { loyaltyAccount: true },
    });
    expect(profile.loyaltyAccount?.balance).toBe(0);
  });
});
