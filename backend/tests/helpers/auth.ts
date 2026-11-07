import { randomUUID } from "node:crypto";

import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey } from "jose";

import { createTokenVerifier } from "../../src/auth/token-verifier.js";

export const TEST_ISSUER = "https://testproject.supabase.co/auth/v1";

interface SignOptions {
  /** Id del usuario (claim `sub`). */
  sub?: string;
  email?: string | null;
  issuer?: string;
  audience?: string;
  /** Caducidad relativa a ahora, por ejemplo "1h" o "-1m". */
  expiresIn?: string;
  /** Clave privada con la que firmar (por defecto, la de confianza). */
  signWith?: CryptoKey;
  /** Claims adicionales o que sustituyen a los de un usuario normal. */
  claims?: Record<string, unknown>;
}

/**
 * Entorno de pruebas de autenticación: genera un par de claves ES256 y firma tokens con la misma
 * forma que los de Supabase Auth. Sirve para probar NUESTRA verificación; no simula a Supabase.
 */
export async function createTestAuth() {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "ES256", use: "sig" };
  const keys = createLocalJWKSet({ keys: [jwk] });

  async function sign(options: SignOptions = {}): Promise<string> {
    const sub = options.sub ?? randomUUID();
    const base: Record<string, unknown> = {
      role: "authenticated",
      aal: "aal1",
      session_id: randomUUID(),
      is_anonymous: false,
      ...(options.email === null
        ? {}
        : { email: options.email ?? `user-${sub.slice(0, 8)}@example.test` }),
      ...options.claims,
    };
    return new SignJWT(base)
      .setProtectedHeader({ alg: "ES256", kid: "test-key" })
      .setIssuer(options.issuer ?? TEST_ISSUER)
      .setAudience(options.audience ?? "authenticated")
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime(options.expiresIn ?? "1h")
      .sign(options.signWith ?? privateKey);
  }

  return {
    keys,
    privateKey,
    sign,
    verifyToken: createTokenVerifier({ keys, issuer: TEST_ISSUER }),
  };
}
