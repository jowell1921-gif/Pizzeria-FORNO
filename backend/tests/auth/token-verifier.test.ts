import { randomUUID } from "node:crypto";

import { SignJWT, generateKeyPair } from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import { TokenError } from "../../src/auth/token-verifier.js";
import { createTestAuth, TEST_ISSUER } from "../helpers/auth.js";

let auth: Awaited<ReturnType<typeof createTestAuth>>;

beforeAll(async () => {
  auth = await createTestAuth();
});

async function rejection(token: string): Promise<TokenError> {
  const error = await auth.verifyToken(token).then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(TokenError);
  return error as TokenError;
}

describe("access token verification", () => {
  it("accepts a valid token and extracts the identity", async () => {
    const sub = randomUUID();
    const token = await auth.sign({
      sub,
      email: "Ana@Example.Test",
      claims: { user_metadata: { full_name: "Ana López" } },
    });

    expect(await auth.verifyToken(token)).toEqual({
      userId: sub,
      email: "ana@example.test",
      displayName: "Ana López",
    });
  });

  it("falls back to the provider name and then to no name", async () => {
    const withName = await auth.sign({ claims: { user_metadata: { name: "Luis Pérez" } } });
    expect((await auth.verifyToken(withName)).displayName).toBe("Luis Pérez");
    expect((await auth.verifyToken(await auth.sign())).displayName).toBeNull();
  });

  it("rejects an expired token with a specific reason", async () => {
    const token = await auth.sign({ expiresIn: "-1m" });
    expect((await rejection(token)).reason).toBe("expired");
  });

  it("rejects a token signed with a key that is not in the project key set", async () => {
    const { privateKey: attacker } = await generateKeyPair("ES256");
    const token = await auth.sign({ signWith: attacker });
    expect((await rejection(token)).reason).toBe("invalid");
  });

  it("rejects a tampered payload or signature", async () => {
    const token = await auth.sign();
    const [header, payload, signature] = token.split(".") as [string, string, string];

    const forgedPayload = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload, "base64url").toString()),
        sub: randomUUID(),
      }),
    ).toString("base64url");
    expect((await rejection(`${header}.${forgedPayload}.${signature}`)).reason).toBe("invalid");

    const brokenSignature = signature.slice(0, -2) + (signature.endsWith("AA") ? "BB" : "AA");
    expect((await rejection(`${header}.${payload}.${brokenSignature}`)).reason).toBe("invalid");
  });

  it("rejects a token from another issuer or for another audience", async () => {
    expect(
      (await rejection(await auth.sign({ issuer: "https://evil.example/auth/v1" }))).reason,
    ).toBe("invalid");
    expect((await rejection(await auth.sign({ audience: "anon" }))).reason).toBe("invalid");
  });

  it("rejects symmetric (HS256) tokens and unsigned tokens", async () => {
    const hs256 = await new SignJWT({ role: "authenticated", email: "a@example.test" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(TEST_ISSUER)
      .setAudience("authenticated")
      .setSubject(randomUUID())
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("a-shared-secret-that-an-attacker-could-guess"));
    expect((await rejection(hs256)).reason).toBe("invalid");

    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        iss: TEST_ISSUER,
        aud: "authenticated",
        sub: randomUUID(),
        role: "authenticated",
        email: "a@example.test",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url");
    expect((await rejection(`${header}.${payload}.`)).reason).toBe("invalid");
  });

  it("rejects tokens that are not for a signed-in, non-anonymous user", async () => {
    expect((await rejection(await auth.sign({ claims: { role: "anon" } }))).reason).toBe("invalid");
    expect((await rejection(await auth.sign({ claims: { role: "service_role" } }))).reason).toBe(
      "invalid",
    );
    expect((await rejection(await auth.sign({ claims: { is_anonymous: true } }))).reason).toBe(
      "invalid",
    );
    expect((await rejection(await auth.sign({ email: null }))).reason).toBe("invalid");
    expect((await rejection(await auth.sign({ sub: "not-a-uuid" }))).reason).toBe("invalid");
  });

  it("rejects garbage", async () => {
    for (const token of ["", "abc", "a.b.c", "Bearer x"]) {
      expect((await rejection(token)).reason).toBe("invalid");
    }
  });

  it("does not take roles or permissions from the token", async () => {
    const token = await auth.sign({
      claims: {
        app_metadata: { role: "ADMIN", roles: ["ADMIN"] },
        user_metadata: { role: "ADMIN" },
      },
    });
    // La identidad solo expone id, correo y nombre: no hay nada de roles que pueda usarse.
    expect(Object.keys(await auth.verifyToken(token)).sort()).toEqual([
      "displayName",
      "email",
      "userId",
    ]);
  });
});
