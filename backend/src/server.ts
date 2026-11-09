import { createApp } from "./app.js";
import { createSupabaseTokenVerifier } from "./auth/token-verifier.js";
import { loadEnv, selfAdminEnabled } from "./config/env.js";
import { createPrismaClient } from "./db/client.js";
import { createSupabaseStorage } from "./modules/admin/storage.js";

const env = loadEnv();
const prisma = createPrismaClient(env.DATABASE_URL);
const app = createApp(
  {
    ...env,
    LOG_PRETTY: env.NODE_ENV === "development",
    SELF_ADMIN_ENABLED: selfAdminEnabled(env),
  },
  {
    prisma,
    verifyToken: createSupabaseTokenVerifier(env.SUPABASE_URL),
    ...(env.SUPABASE_SECRET_KEY
      ? {
          storage: createSupabaseStorage({
            url: env.SUPABASE_URL,
            secretKey: env.SUPABASE_SECRET_KEY,
            bucket: env.SUPABASE_STORAGE_BUCKET,
          }),
        }
      : {}),
  },
);

const server = app.listen(env.PORT, () => {
  console.log(`FORNO API listening on port ${env.PORT} (${env.NODE_ENV})`);
});

// Cierre ordenado: deja de aceptar peticiones y libera las conexiones a la base de datos.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  });
}
