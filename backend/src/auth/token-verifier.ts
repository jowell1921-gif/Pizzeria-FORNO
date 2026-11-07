import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";

/** Identidad extraída de un access token de Supabase ya verificado. */
export interface VerifiedIdentity {
  /** Id del usuario en Supabase Auth (claim `sub`). */
  userId: string;
  email: string;
  /** Nombre que Supabase conoce del usuario (por ejemplo, el de su cuenta de Google). */
  displayName: string | null;
}

export class TokenError extends Error {
  constructor(readonly reason: "expired" | "invalid") {
    super(reason === "expired" ? "The access token has expired" : "The access token is not valid");
    this.name = "TokenError";
  }
}

export type TokenVerifier = (token: string) => Promise<VerifiedIdentity>;

/** Solo claves asimétricas: la firma se comprueba con la clave pública publicada por Supabase. */
const ALLOWED_ALGORITHMS = ["ES256", "RS256"];

const claimsSchema = z.object({
  sub: z.uuid(),
  email: z.string().min(3),
  role: z.literal("authenticated"),
  is_anonymous: z.boolean().optional(),
  user_metadata: z
    .object({ full_name: z.string().optional(), name: z.string().optional() })
    .loose()
    .optional(),
});

interface VerifierOptions {
  keys: JWTVerifyGetKey;
  issuer: string;
  audience?: string;
}

/**
 * Crea un verificador de tokens. Comprueba la firma, la caducidad (con 5 s de margen de reloj),
 * el emisor, la audiencia y el algoritmo, y rechaza usuarios anónimos. No se confía en nada que
 * no venga firmado: los roles y permisos NO se leen del token.
 */
export function createTokenVerifier({
  keys,
  issuer,
  audience = "authenticated",
}: VerifierOptions): TokenVerifier {
  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, keys, {
        issuer,
        audience,
        algorithms: ALLOWED_ALGORITHMS,
        clockTolerance: 5,
      });

      const claims = claimsSchema.parse(payload);
      if (claims.is_anonymous) throw new TokenError("invalid");

      return {
        userId: claims.sub,
        email: claims.email.toLowerCase(),
        displayName: claims.user_metadata?.full_name ?? claims.user_metadata?.name ?? null,
      };
    } catch (error) {
      if (error instanceof TokenError) throw error;
      if (error instanceof errors.JWTExpired) throw new TokenError("expired");
      throw new TokenError("invalid");
    }
  };
}

/** Verificador de producción: usa el JWKS público del proyecto de Supabase (con caché). */
export function createSupabaseTokenVerifier(supabaseUrl: string): TokenVerifier {
  const base = supabaseUrl.replace(/\/+$/, "");
  return createTokenVerifier({
    keys: createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`)),
    issuer: `${base}/auth/v1`,
  });
}
