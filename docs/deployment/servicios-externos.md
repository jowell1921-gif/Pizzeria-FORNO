# Servicios externos: qué configurar y cómo

Todos estos pasos los hace el propietario en cada plataforma. Las variables están en
[`variables.md`](./variables.md). Los nombres de los menús pueden variar: consulta la documentación
oficial si algo no coincide.

## Supabase

1. **Crear el proyecto de producción** (región cercana a Railway; guarda la contraseña de la base de datos en un gestor de contraseñas).
2. **Aplicar el esquema.** Desde `backend/`, con `DATABASE_URL` apuntando al proyecto de producción:
   ```bash
   npx prisma migrate deploy
   ```
   (Railway lo hace solo en cada despliegue con `preDeployCommand`; la primera vez puedes dejar que lo haga Railway.) Las migraciones activan RLS en todas las tablas, sin políticas: los clientes de Supabase (web y Flutter) no pueden leer ni escribir tablas de negocio; todo pasa por la API.
3. **Datos iniciales.** No ejecutes el relleno de demostración en producción salvo que sea una demostración pública (`npm run db:seed` siembra la carta de ejemplo, zonas y promociones). Con un negocio real, la carta, los horarios y las zonas se crean desde el panel.
4. **Autenticación.** Site URL y Redirect URLs con el dominio definitivo; correo (SMTP propio si quieres plantillas propias y envío a cualquier cliente); Google OAuth con la URL de retorno del proyecto de producción. Detalles en [`../security/supabase-auth.md`](../security/supabase-auth.md).
5. **Almacenamiento.** Bucket público `products` para las fotos de la carta.
6. **Primer administrador.** Tras registrarte en la web, desde `backend/`: `npm run roles -- grant tu@correo ADMIN`.
7. **Copias de seguridad.** Ver [`copias-de-seguridad.md`](./copias-de-seguridad.md).

## Railway (API)

1. Crear un proyecto y un servicio desde el repositorio de GitHub.
2. **Root Directory:** `backend`. El archivo [`backend/railway.json`](../../backend/railway.json) define: compilación (`npm run build`), **migración antes de cada despliegue** (`npx prisma migrate deploy`), arranque (`npm run start`) y comprobación de vivacidad (`/api/v1/health`).
3. Poner las variables de [`variables.md`](./variables.md) (`NODE_ENV=production`, `TRUST_PROXY=1`, etc.).
4. Generar el dominio público de Railway (o conectar uno propio: [Dominio y HTTPS](#dominio-y-https)).
5. Comprobar el primer despliegue: el registro debe decir `FORNO API listening… (production)`, y `GET /api/v1/health/ready` debe responder `ready`.
6. Mantener **una sola réplica** del servicio: el bus de eventos (cocina en directo y efectos de pedido) vive en memoria (decisiones 0009 y 0012). Con varias réplicas habría que moverlo a Redis o a `LISTEN/NOTIFY` de PostgreSQL.

## Vercel (web)

1. Importar el repositorio de GitHub como proyecto nuevo.
2. **Root Directory:** `frontend`. Framework: Next.js (se detecta solo). Comando de compilación: `npm run build`.
3. Poner las variables `NEXT_PUBLIC_*` de [`variables.md`](./variables.md) en el entorno **Production** (y en Preview si se quiere).
4. Desplegar. Cada subida a `main` genera un despliegue de producción; las ramas generan vistas previas.
5. Tras cambiar una variable `NEXT_PUBLIC_*`, **redesplegar** (se incorporan en la compilación).

## Dominio y HTTPS

Lo normal es un dominio para la web y un subdominio para la API:

| Nombre                                | Apunta a                                                                     | Para |
| ------------------------------------- | ---------------------------------------------------------------------------- | ---- |
| `forno.ejemplo` y `www.forno.ejemplo` | Vercel (los registros que indique Vercel en «Domains»)                       | Web  |
| `api.forno.ejemplo`                   | Railway (registro CNAME que indique Railway en «Networking → Custom Domain») | API  |

Vercel y Railway emiten y renuevan los certificados HTTPS solos. Después, actualiza `CORS_ORIGINS`,
`FRONTEND_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL` y las URL de Supabase Auth con los
dominios definitivos, y redespliega.

## Stripe

1. **Cuenta activada** para cobrar (Stripe pide datos del negocio para pasar de modo prueba a real). Mientras sea una demostración, se puede seguir con claves de prueba (`sk_test_…`); los pagos no serán reales.
2. **Webhook:** Developers → Webhooks → añadir endpoint `https://api.forno.ejemplo/api/v1/webhooks/stripe` con los seis eventos de [`variables.md`](./variables.md#stripe). Copia el «Signing secret» (`whsec_…`) a `STRIPE_WEBHOOK_SECRET` en Railway.
3. Poner `STRIPE_SECRET_KEY` en Railway. La clave publicable **no** se usa (el pago se hace en la página de Stripe).
4. Probar con un pedido real de poco importe y reembolsarlo desde el panel.
5. Al arrancar, el registro avisará si producción usa una clave `sk_test_` (`[config] …`).

## Correo (Resend)

Opcional. Sin configurarlo, los correos de pedido se registran y se leen en el panel (Correos), pero
no se envían. Para enviarlos a los clientes:

1. Resend → Domains: añadir y **verificar el dominio** (registros SPF y DKIM en tu proveedor de dominio).
2. Crear una API key y ponerla en Railway: `EMAIL_DRIVER=resend`, `RESEND_API_KEY`, `EMAIL_FROM=FORNO <pedidos@forno.ejemplo>`. **No** pongas `EMAIL_ONLY_TO`.
3. Para los correos de acceso de Supabase (confirmar registro y recuperar contraseña), configura el SMTP propio en Supabase con el mismo dominio (`smtp.resend.com`, puerto 465, usuario `resend`, contraseña = API key).

No se envían comunicaciones comerciales: solo avisos del propio pedido.

## PizzAI con IA (opcional)

Con una clave de la API de Anthropic en `ANTHROPIC_API_KEY` (solo en Railway), PizzAI responde con IA
usando los datos públicos de la carta. Cada respuesta tiene un coste: el límite diario
(`ASSISTANT_DAILY_LIMIT`) y los límites por IP acotan el gasto. Sin clave, PizzAI sigue en modo
demostración. Detalles en [`../decisions/0013-pizzai-ia.md`](../decisions/0013-pizzai-ia.md).
