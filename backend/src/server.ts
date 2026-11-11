import { createApp } from "./app.js";
import { createSupabaseTokenVerifier } from "./auth/token-verifier.js";
import { frontendUrl, loadEnv, selfAdminEnabled } from "./config/env.js";
import { createPrismaClient } from "./db/client.js";
import { createSupabaseStorage } from "./modules/admin/storage.js";
import { createLogMailer, createResendMailer } from "./modules/notifications/mailer.js";
import { startNotificationWorker } from "./modules/notifications/notification.service.js";
import { registerOrderEffects } from "./modules/orders/order-effects.js";
import { createStripeGateway } from "./modules/payments/gateway.js";

const env = loadEnv();
const prisma = createPrismaClient(env.DATABASE_URL);

// Pago online: solo si están las dos claves de Stripe. Sin ellas, ese método no se ofrece.
const payments =
  env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET
    ? createStripeGateway(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET)
    : undefined;

// Correo: por defecto solo se registra (se puede leer en el panel); con Resend se envía de verdad.
const mailer =
  env.EMAIL_DRIVER === "resend" && env.RESEND_API_KEY
    ? createResendMailer({
        apiKey: env.RESEND_API_KEY,
        from: env.EMAIL_FROM,
        onlyTo: env.EMAIL_ONLY_TO,
      })
    : createLogMailer();

const app = createApp(
  {
    ...env,
    LOG_PRETTY: env.NODE_ENV === "development",
    SELF_ADMIN_ENABLED: selfAdminEnabled(env),
    FRONTEND_URL: frontendUrl(env),
  },
  {
    prisma,
    verifyToken: createSupabaseTokenVerifier(env.SUPABASE_URL),
    ...(payments ? { payments } : {}),
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

// Avisos por correo y devoluciones tras cada cambio de pedido, sin bloquearlo.
registerOrderEffects(prisma, { mailer, gateway: payments });
const stopWorker = startNotificationWorker(prisma, mailer);

const server = app.listen(env.PORT, () => {
  console.log(`FORNO API listening on port ${env.PORT} (${env.NODE_ENV})`);
  console.log(
    `Online payments: ${payments ? "enabled (Stripe)" : "disabled"} · Email: ${mailer.driver}`,
  );
});

// Cierre ordenado: deja de aceptar peticiones y libera las conexiones a la base de datos.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopWorker();
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  });
}
