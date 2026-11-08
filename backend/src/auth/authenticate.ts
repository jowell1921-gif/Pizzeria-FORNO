import type { RequestHandler } from "express";

import type { PrismaClient } from "../db/client.js";
import type { RoleName } from "../generated/prisma/enums.js";
import { forbidden, unauthorized } from "../errors.js";
import { permissionsFor, type Permission } from "./permissions.js";
import { ensureProfile } from "./profile-service.js";
import { TokenError, type TokenVerifier } from "./token-verifier.js";

/** Usuario autenticado de la petición. Se rellena solo tras verificar el token en el servidor. */
export interface AuthContext {
  userId: string;
  email: string;
  roles: RoleName[];
  permissions: Permission[];
}

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthContext;
  }
}

/** Extrae el token de `Authorization: Bearer <token>`; cualquier otro formato se rechaza. */
export function readBearerToken(header: string | undefined): string {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  if (!match?.[1]) throw unauthorized();
  return match[1];
}

interface AuthDependencies {
  verifyToken: TokenVerifier;
  prisma: PrismaClient;
}

/**
 * Middleware de autenticación: verifica el access token de Supabase, asegura el perfil y carga
 * los roles desde la base de datos. Ignora cualquier identidad, rol o permiso que envíe el cliente
 * por otra vía (cabeceras, cuerpo o parámetros).
 */
export function createAuthenticate({ verifyToken, prisma }: AuthDependencies): RequestHandler {
  return async (req, res, next) => {
    try {
      const token = readBearerToken(req.headers.authorization);
      const identity = await verifyToken(token).catch((error: unknown) => {
        if (error instanceof TokenError) {
          throw unauthorized(
            error.reason === "expired" ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
            error.message,
          );
        }
        throw error;
      });

      const profile = await ensureProfile(prisma, identity);
      req.auth = {
        userId: profile.id,
        email: profile.email,
        roles: profile.roles,
        permissions: permissionsFor(profile.roles),
      };
      next();
    } catch (error) {
      if (error instanceof Error && error.name === "HttpError") {
        const status = (error as { status?: number }).status;
        if (status === 401) res.setHeader("WWW-Authenticate", 'Bearer realm="forno"');
      }
      next(error);
    }
  };
}

/**
 * Autenticación opcional: sin cabecera `Authorization` la petición sigue como anónima; con ella, se
 * verifica igual que en `authenticate` (un token inválido o caducado sigue siendo un error 401).
 */
export function createOptionalAuthenticate(deps: AuthDependencies): RequestHandler {
  const authenticate = createAuthenticate(deps);
  return (req, res, next) => {
    if (req.headers.authorization === undefined) {
      next();
      return;
    }
    void authenticate(req, res, next);
  };
}

/** Exige un permiso concreto. Debe ir después de `authenticate`. */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(unauthorized());
      return;
    }
    if (!req.auth.permissions.includes(permission)) {
      next(forbidden());
      return;
    }
    next();
  };
}
