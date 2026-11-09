import { randomUUID } from "node:crypto";

import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";

import { createAuthenticate, createOptionalAuthenticate } from "./auth/authenticate.js";
import type { TokenVerifier } from "./auth/token-verifier.js";
import { docsEnabled, type Env } from "./config/env.js";
import type { PrismaClient } from "./db/client.js";
import { createDocsRouter } from "./docs/docs.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { createLogger, httpLogger } from "./middleware/http-logger.js";
import {
  DEFAULT_RATE_LIMITS,
  ipRateLimit,
  userRateLimits,
  type RateLimitConfig,
} from "./middleware/rate-limit.js";
import { createAdminRouter } from "./modules/admin/admin.routes.js";
import type { ImageStorage } from "./modules/admin/storage.js";
import { createAddressesRouter } from "./modules/addresses/addresses.routes.js";
import { createCartRouter } from "./modules/cart/cart.routes.js";
import { createCatalogRouter } from "./modules/catalog/catalog.routes.js";
import { createCheckoutRouter } from "./modules/checkout/checkout.routes.js";
import { createDeliveryRouter } from "./modules/delivery/delivery.routes.js";
import { createKitchenRouter } from "./modules/kitchen/kitchen.routes.js";
import {
  createLoyaltyProgramRouter,
  createLoyaltyRouter,
} from "./modules/loyalty/loyalty.routes.js";
import { createMeRouter } from "./modules/me/me.routes.js";
import { createOrdersRouter } from "./modules/orders/orders.routes.js";
import { createPromotionsRouter } from "./modules/promotions/promotions.routes.js";
import { createStoreRouter } from "./modules/store/store.routes.js";
import { healthRouter } from "./routes/health.js";

/** Servicios externos que necesitan las rutas con base de datos. */
export interface AppDependencies {
  prisma: PrismaClient;
  verifyToken: TokenVerifier;
  /** Almacén de imágenes (Supabase Storage). Sin él, la subida de fotos responde 503. */
  storage?: ImageStorage;
}

export interface AppOptions extends Pick<Env, "CORS_ORIGINS"> {
  NODE_ENV?: Env["NODE_ENV"];
  LOG_LEVEL?: Env["LOG_LEVEL"];
  /** Registros legibles en la terminal (solo desarrollo). */
  LOG_PRETTY?: boolean;
  TRUST_PROXY?: Env["TRUST_PROXY"];
  API_DOCS_ENABLED?: Env["API_DOCS_ENABLED"];
  /** Si los usuarios pueden hacerse administradores desde su cuenta (solo demo). Por defecto, no. */
  SELF_ADMIN_ENABLED?: boolean;
  /** Límites de peticiones; por defecto los de producción (las pruebas pasan los suyos). */
  rateLimits?: RateLimitConfig;
}

export function createApp(options: AppOptions, deps?: AppDependencies): Express {
  const app = express();
  const limits = options.rateLimits ?? DEFAULT_RATE_LIMITS;

  app.disable("x-powered-by");
  // Detrás de un proxy (Railway) la IP real viene en X-Forwarded-For; solo se confía si se indica.
  app.set("trust proxy", options.TRUST_PROXY ?? 0);

  app.use((_req, res, next) => {
    const requestId = randomUUID();
    res.locals["requestId"] = requestId;
    res.setHeader("X-Request-Id", requestId);
    next();
  });
  app.use(helmet());
  app.use(
    cors({
      origin: options.CORS_ORIGINS,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
      allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
      exposedHeaders: ["X-Request-Id", "RateLimit", "RateLimit-Policy", "Retry-After"],
      maxAge: 600,
    }),
  );
  app.use(httpLogger(createLogger(options.LOG_LEVEL ?? "silent", options.LOG_PRETTY)));

  // La comprobación de salud no cuenta para el límite (la usan monitores y el despliegue).
  app.use("/api/v1/health", healthRouter);
  app.use("/api/v1", ipRateLimit(limits));
  app.use(express.json({ limit: "100kb" }));

  if (
    docsEnabled({
      NODE_ENV: options.NODE_ENV ?? "development",
      API_DOCS_ENABLED: options.API_DOCS_ENABLED,
    })
  ) {
    app.use("/api/v1", createDocsRouter());
  }

  if (deps) {
    const { prisma } = deps;
    app.use("/api/v1", createCatalogRouter(prisma));
    app.use("/api/v1/promotions", createPromotionsRouter(prisma));
    app.use("/api/v1/store", createStoreRouter(prisma));
    app.use("/api/v1/delivery-zones", createDeliveryRouter(prisma));

    const authenticate = createAuthenticate(deps);
    app.use("/api/v1/checkout", createOptionalAuthenticate(deps), createCheckoutRouter(prisma));
    const userLimits = userRateLimits(limits);
    app.use("/api/v1/me/addresses", authenticate, ...userLimits, createAddressesRouter(prisma));
    app.use(
      "/api/v1/me",
      authenticate,
      ...userLimits,
      createMeRouter(prisma, options.SELF_ADMIN_ENABLED ?? false),
    );
    app.use("/api/v1/admin", authenticate, ...userLimits, createAdminRouter(prisma, deps.storage));
    app.use("/api/v1/kitchen", authenticate, ...userLimits, createKitchenRouter(prisma));
    app.use("/api/v1/cart", authenticate, ...userLimits, createCartRouter(prisma));
    app.use("/api/v1/loyalty/program", createLoyaltyProgramRouter(prisma));
    app.use("/api/v1/loyalty", authenticate, ...userLimits, createLoyaltyRouter(prisma));
    app.use("/api/v1/orders", authenticate, ...userLimits, createOrdersRouter(prisma));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
