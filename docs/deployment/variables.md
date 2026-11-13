# Variables de entorno por servicio

Los archivos `.env` reales **nunca** se suben a Git. Cada proyecto tiene un `.env.example` con todas
las variables y su explicación (`backend/.env.example`, `frontend/.env.example`). Esta tabla dice
dónde va cada una en producción y de dónde sale el valor.

## API (Railway, carpeta `backend/`)

| Variable                                             | Obligatoria        | Valor en producción                                                                           | De dónde sale                                                                                                                                              |
| ---------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                           | Sí                 | `production`                                                                                  | Fijo                                                                                                                                                       |
| `PORT`                                               | No                 | (Railway la define sola)                                                                      | Railway                                                                                                                                                    |
| `DATABASE_URL`                                       | Sí                 | Cadena de conexión de Supabase (ver nota)                                                     | Supabase → Connect                                                                                                                                         |
| `SUPABASE_URL`                                       | Sí                 | `https://<ref>.supabase.co`                                                                   | Supabase → Project Settings → API                                                                                                                          |
| `CORS_ORIGINS`                                       | Sí                 | `https://fornea.ejemplo` (el dominio de la web, sin barra final; varios, separados por comas) | Tu dominio                                                                                                                                                 |
| `FRONTEND_URL`                                       | Recomendada        | `https://fornea.ejemplo`                                                                      | Tu dominio (a donde vuelve el cliente tras pagar en Stripe)                                                                                                |
| `TRUST_PROXY`                                        | Sí                 | `1`                                                                                           | Railway pone un proxy delante                                                                                                                              |
| `LOG_LEVEL`                                          | No                 | `info`                                                                                        | —                                                                                                                                                          |
| `API_DOCS_ENABLED`                                   | No                 | sin definir (la documentación no se publica en producción)                                    | —                                                                                                                                                          |
| `OWNER_EMAIL`                                        | Recomendada        | El correo con el que te registras en la web                                                   | Único usuario que puede modificar carta, promociones, FORNEA CLUB y local; el resto de administradores lo ve en modo lectura. Sin ella, no hay restricción |
| `DATABASE_POOL_MAX`                                  | No                 | `10` (por defecto)                                                                            | Conexiones máximas a PostgreSQL por proceso; reparte el límite de Supabase entre réplicas                                                                  |
| `SELF_ADMIN_ENABLED`                                 | Sí                 | `false` en un negocio real; `true` solo en una demostración pública                           | —                                                                                                                                                          |
| `SUPABASE_SECRET_KEY`                                | Para subir fotos   | `sb_secret_…`                                                                                 | Supabase → API Keys. **Solo aquí**                                                                                                                         |
| `SUPABASE_STORAGE_BUCKET`                            | No                 | `products`                                                                                    | Bucket público de Storage                                                                                                                                  |
| `STRIPE_SECRET_KEY`                                  | Para pagos         | `sk_live_…` (o `sk_test_…` en demostración)                                                   | Stripe → Developers → API keys                                                                                                                             |
| `STRIPE_WEBHOOK_SECRET`                              | Para pagos         | `whsec_…` del endpoint de producción                                                          | Stripe → Developers → Webhooks                                                                                                                             |
| `EMAIL_DRIVER`                                       | No                 | `log` (por defecto) o `resend`                                                                | —                                                                                                                                                          |
| `RESEND_API_KEY`                                     | Con `resend`       | `re_…`                                                                                        | Resend → API Keys                                                                                                                                          |
| `EMAIL_FROM`                                         | Con `resend`       | `FORNEA <pedidos@fornea.ejemplo>` (dominio verificado)                                        | Resend → Domains                                                                                                                                           |
| `EMAIL_ONLY_TO`                                      | No                 | **Quitar** cuando haya dominio verificado                                                     | —                                                                                                                                                          |
| `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `ASSISTANT_*` | Para PizzAI con IA | Ver `backend/.env.example`                                                                    | Consola de Anthropic. **Solo aquí**                                                                                                                        |

**Nota sobre `DATABASE_URL` con Supabase.** Railway solo tiene IPv4. La conexión directa de Supabase
(`db.<ref>.supabase.co:5432`) usa IPv6, así que usa la cadena del **Session pooler** (host
`aws-0-<región>.pooler.supabase.com`, puerto `5432`, usuario `postgres.<ref>`). Esa misma cadena sirve
para las migraciones (necesitan una conexión de sesión, no la de transacción del puerto 6543).
Añade `?sslmode=require` si la plataforma no lo impone. Verifica la conexión en el primer despliegue
(el registro de la migración previa lo mostrará).

## Web (Vercel, carpeta `frontend/`)

Estas variables `NEXT_PUBLIC_*` se incorporan al código del navegador en la **compilación**: tras
cambiarlas hay que volver a desplegar.

| Variable                               | Valor en producción                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`                  | `https://api.fornea.ejemplo/api/v1` (la URL pública de Railway o tu dominio de API) |
| `NEXT_PUBLIC_SITE_URL`                 | `https://fornea.ejemplo`                                                            |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://<ref>.supabase.co`                                                         |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` (la clave **pública**)                                           |

**Nunca** pongas en Vercel la clave secreta de Supabase, la de Stripe ni la de ningún proveedor de IA.

## Supabase (panel del proyecto)

| Ajuste                                        | Valor                                                                                                                         |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Authentication → URL Configuration → Site URL | `https://fornea.ejemplo`                                                                                                      |
| Redirect URLs                                 | `https://fornea.ejemplo/auth/callback` y `https://fornea.ejemplo/auth/confirm` (y las de desarrollo, si se quieren conservar) |
| Authentication → Providers → Google           | ID y secreto del cliente de Google (ver `docs/security/supabase-auth.md`)                                                     |
| Storage                                       | Bucket público `products`                                                                                                     |

## Stripe

| Ajuste             | Valor                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Webhook (endpoint) | `https://api.fornea.ejemplo/api/v1/webhooks/stripe`                                                                                                                                               |
| Eventos a enviar   | `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `payment_intent.payment_failed`, `charge.refunded` |
