import { randomUUID } from "node:crypto";

import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";

import { createAuthenticate } from "./auth/authenticate.js";
import type { TokenVerifier } from "./auth/token-verifier.js";
import type { Env } from "./config/env.js";
import type { PrismaClient } from "./db/client.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { createAddressesRouter } from "./modules/addresses/addresses.routes.js";
import { createLoyaltyRouter } from "./modules/loyalty/loyalty.routes.js";
import { createMeRouter } from "./modules/me/me.routes.js";
import { createOrdersRouter } from "./modules/orders/orders.routes.js";
import { healthRouter } from "./routes/health.js";

/** Servicios externos que necesitan las rutas autenticadas. */
export interface AppDependencies {
  prisma: PrismaClient;
  verifyToken: TokenVerifier;
}

export function createApp(env: Pick<Env, "CORS_ORIGINS">, deps?: AppDependencies): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    const requestId = randomUUID();
    res.locals["requestId"] = requestId;
    res.setHeader("X-Request-Id", requestId);
    next();
  });
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS }));
  app.use(express.json({ limit: "100kb" }));

  app.use("/api/v1/health", healthRouter);

  if (deps) {
    const authenticate = createAuthenticate(deps);
    app.use("/api/v1/me/addresses", authenticate, createAddressesRouter(deps.prisma));
    app.use("/api/v1/me", authenticate, createMeRouter(deps.prisma));
    app.use("/api/v1/loyalty", authenticate, createLoyaltyRouter(deps.prisma));
    app.use("/api/v1/orders", authenticate, createOrdersRouter(deps.prisma));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
