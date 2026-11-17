# Producción: cómo está desplegado FORNEA hoy

Fecha: 17 de noviembre de 2026. Es el estado **real** de la demostración publicada en
**https://forneapizzeria.es**. Las guías genéricas están en [`README.md`](./README.md) y
[`servicios-externos.md`](./servicios-externos.md); este documento recoge lo que se hizo de verdad,
los valores que no son secretos y los problemas que aparecieron, para poder rehacerlo o repararlo sin
depender de nadie.

> **Ningún secreto está en este documento ni en Git.** Las claves viven solo en los paneles de Railway,
> Vercel, Supabase, Stripe, Resend y Google, y en el gestor de contraseñas del propietario. Aquí solo
> se nombran las variables.

## Mapa

```
Navegador ── https://forneapizzeria.es ──► Vercel (web, Next.js)
    │                                           │
    └── https://api.forneapizzeria.es/api/v1 ──► Railway (API Express, 1 réplica, EU West)
                                                    ├─► Supabase: PostgreSQL (Session pooler), Auth, Storage
                                                    ├─► Stripe (modo PRUEBA) ◄── webhook firmado
                                                    ├─► Resend (correos de pedido)
                                                    └─► Gemini (PizzAI)
Supabase Auth ──► Resend (SMTP) para los correos de registro y de recuperar contraseña
```

| Servicio                 | Qué aloja                                              | Detalle                                                                                                  |
| ------------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| DonDominio               | Dominio `forneapizzeria.es` y su DNS                   | Registrador. Renovación: revisar la fecha y activarla                                                    |
| Vercel (plan Hobby)      | Web (`frontend/`)                                      | Proyecto `pizzeria-fornea`. Root Directory `frontend`. Despliega solo al subir a `main`                  |
| Railway                  | API (`backend/`)                                       | Proyecto `Fornea_Pizzeria`, servicio `Pizzeria-FORNO`. Root Directory `backend`. Puerto 8080. 1 réplica  |
| Supabase (plan gratuito) | PostgreSQL, Auth y Storage (bucket público `products`) | Proyecto con referencia `ednvqfmdvudmgjorvcxo`. Se **pausa** tras una semana sin actividad (ver monitor) |
| Stripe                   | Pagos con tarjeta, **modo prueba**                     | Los pagos no son reales (tarjeta `4242 4242 4242 4242`)                                                  |
| Resend                   | Correos de pedido y de acceso                          | Dominio `forneapizzeria.es` verificado. Plan gratuito: 100 correos al día                                |
| Google Cloud             | Inicio de sesión con Google                            | Cliente OAuth «FORNO web» (el nombre interno no se ve)                                                   |
| Gemini (Google AI)       | PizzAI                                                 | Clave gratuita, con límites                                                                              |

## DNS (en DonDominio)

| Tipo    | Nombre                | Apunta a                                | Para qué                      |
| ------- | --------------------- | --------------------------------------- | ----------------------------- |
| `A`     | `@`                   | `216.198.79.1`                          | Web en Vercel                 |
| `CNAME` | `www`                 | `c425bb3a6236d3a9.vercel-dns-017.com`   | Web en Vercel (`www`)         |
| `CNAME` | `api`                 | `k119pi2r.up.railway.app`               | API en Railway                |
| `TXT`   | `_railway-verify.api` | el valor que da Railway (Custom Domain) | Verifica el dominio de la API |
| `TXT`   | `resend._domainkey`   | el valor que da Resend                  | Firma DKIM de los correos     |
| `CNAME` | `rsend` y `send`      | los valores que da Resend (`…mta.net`)  | Envío (SPF) de Resend         |

Los registros que ya traía DonDominio (SPF `v=spf1 include:spf.dondominio.com`, `mail`, `imap`, `pop`,
`smtp`, `webmail`, `ftp`, `bbdd`) se dejaron como estaban. Se **borró** el `ANAME` de aparcamiento del
dominio raíz y se **editó** el `CNAME` de `www` que apuntaba a la página de aparcamiento: si
siguen ahí, compiten con los de Vercel y el dominio no se valida. No se activó «Enable receiving» en Resend
(añadiría un `MX` que chocaría con el correo de DonDominio).

## Variables de entorno

Solo los **nombres**; los valores están en cada panel. La lista completa y su explicación:
[`variables.md`](./variables.md).

**Railway** (API): `NODE_ENV=production`, `TRUST_PROXY=1`, `DATABASE_URL` (cadena del **Session pooler** de
Supabase), `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CORS_ORIGINS` (`https://forneapizzeria.es` y
`https://www.forneapizzeria.es`), `FRONTEND_URL`, `OWNER_EMAIL` (el correo del propietario),
`SELF_ADMIN_ENABLED=true` (es una demostración abierta), `STRIPE_SECRET_KEY` (`sk_test_…`),
`STRIPE_WEBHOOK_SECRET`, `EMAIL_DRIVER=resend`, `RESEND_API_KEY`, `EMAIL_FROM`, `GEMINI_API_KEY`.

**Vercel** (web): `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_URL` (`https://api.forneapizzeria.es/api/v1`),
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Tras cambiar una de ellas hay que
**redesplegar** (se incorporan al compilar).

**Nunca** en Vercel: `sb_secret_…`, claves de Stripe, de Resend o de Gemini.

## Configuración de cada plataforma

**Railway.** Root Directory `backend`. El archivo `backend/railway.json` define la compilación, el comando
de arranque y la comprobación `/api/v1/health`. Región **EU West (Ámsterdam)** (comprueba en Settings → Deploy que sigue así), la misma zona que
Supabase (Irlanda): con la API en Estados Unidos, cada consulta tardaba ~150 ms y las transacciones
largas (completar un pedido) agotaban su plazo. Dominio personalizado `api.forneapizzeria.es`
(puerto 8080). Railway instala **solo las dependencias de producción**: por eso `typescript`, `prisma` y
los `@types/…` necesarios están en `dependencies` (comprobable con `NODE_ENV=production npm ci && npm run build`).

**Supabase.**

- Authentication → Sign In / Providers → Email: **«Confirm email» activado** (necesario también para que
  `OWNER_EMAIL` sea fiable).
- Authentication → URL Configuration: Site URL `https://forneapizzeria.es`; Redirect URLs
  `https://forneapizzeria.es/auth/callback` y `https://forneapizzeria.es/auth/confirm`.
- Authentication → Emails → SMTP Settings: SMTP propio de Resend (`smtp.resend.com`, puerto `465`, usuario
  `resend`, contraseña = clave de API de Resend, remitente `no-reply@forneapizzeria.es`). Sin esto,
  Supabase solo envía a unas pocas direcciones y con un límite muy bajo.
- Authentication → Emails → Templates: las de `docs/security/email-templates/` («Confirm sign up» y «Reset
  password»). El logo se sirve desde la propia web (`/image/logo-fornea-email.png`).
- Google: Sign In / Providers → Google con el ID y el secreto del cliente de Google.
- Storage: bucket público `products` (fotos de la carta).

**Google Cloud.** El cliente OAuth tiene como **URI de redireccionamiento autorizada** la de retorno de
Supabase (`https://ednvqfmdvudmgjorvcxo.supabase.co/auth/v1/callback`), **exactamente igual** (sin
espacios ni caracteres de más). «Orígenes de JavaScript» no influye en este flujo.

**Stripe (modo prueba).** Destino de webhook `https://api.forneapizzeria.es/api/v1/webhooks/stripe` con los
seis eventos de `variables.md`; su «Signing secret» es `STRIPE_WEBHOOK_SECRET`.

## Datos iniciales

La base de producción empezó vacía. Se aplicaron las migraciones y se sembraron los datos de
demostración **desde el ordenador del propietario**, con la cadena del Session pooler en una variable
de entorno de esa sola ventana de PowerShell (nunca en un archivo):

```powershell
cd backend
$env:DATABASE_URL = "postgresql://postgres.<ref>:<contraseña>@<host-del-pooler>:5432/postgres"
npx prisma migrate deploy      # aplica las migraciones pendientes
npm run db:seed                # solo la primera vez: carta, horarios, zonas, promociones y recompensas
Remove-Item Env:DATABASE_URL
```

La zona de reparto de la demostración acepta cualquier código postal (se editó en producción con SQL):

```sql
UPDATE "DeliveryZone"
SET name = 'Toda España (demostración)',
    "postalCodes" = ARRAY(SELECT lpad(g::text, 2, '0') || '*' FROM generate_series(0, 99) AS g)
WHERE name LIKE 'Comunidad de Madrid%'
RETURNING name, cardinality("postalCodes");
```

## Cómo se publica una versión nueva

1. Subir a `main`. Vercel y Railway despliegan solos.
2. Railway: Deployments → el último debe quedar `ACTIVE`/«successful»; comprobar
   `https://api.forneapizzeria.es/api/v1/health/ready`.
3. Si la versión trae una **migración nueva** y el despliegue no la aplica sola, aplicarla a mano con los
   comandos de arriba (solo `migrate deploy`; **nunca** `migrate reset`, que borra los datos).
4. Si un despliegue falla, Railway mantiene el último bueno: la web no se cae. Marcha atrás: «Redeploy» sobre
   un despliegue anterior bueno (Railway) o «Promote to Production» (Vercel).

## Operaciones frecuentes

| Necesidad                              | Cómo                                                                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ver quién es administrador             | La web ofrece «Hazte administrador» a cualquiera; solo el correo de `OWNER_EMAIL` edita carta, promociones, club y local. El resto ve solo sus propios pedidos           |
| Repetir una prueba con el mismo correo | **No borres el usuario en Supabase → Users**: deja huérfano su perfil en la base y da «este correo ya está asociado a otra cuenta». Libera el correo con el SQL de abajo |
| Cambiar las plantillas de correo       | Pegar el HTML nuevo en Supabase → Emails → Templates                                                                                                                     |
| Girar una clave                        | Crear la nueva en el proveedor, ponerla en Railway/Vercel/Supabase, redesplegar y borrar la antigua                                                                      |
| Copia de seguridad                     | [`copias-de-seguridad.md`](./copias-de-seguridad.md) (`scripts/backup-produccion.ps1`)                                                                                   |
| Ver errores                            | Railway → Deployments → View logs. Los errores de correo, en el panel → Correos                                                                                          |

Liberar un correo cuyo usuario se borró de Supabase (borrado lógico: no se pierde ningún dato):

```sql
UPDATE "Profile"
SET "deletedAt" = now(),
    email = 'borrado-' || id::text || '@invalid.example',
    username = NULL,
    phone = NULL
WHERE email = '<correo>' AND id = '<id del perfil antiguo>' AND "deletedAt" IS NULL
RETURNING id, email, "deletedAt";
```

## Problemas que aparecieron y cómo se resolvieron

| Síntoma                                                                                    | Causa                                                                                 | Solución                                                                            |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Railway: «Railpack found no buildable project»                                             | Compilaba la raíz del repositorio                                                     | Root Directory `backend`                                                            |
| `ENETUNREACH 2a05:…:5432`                                                                  | `DATABASE_URL` era la conexión directa (IPv6) y Railway solo tiene IPv4               | Cadena del **Session pooler**                                                       |
| `The table public.NotificationLog does not exist`                                          | Las migraciones no se habían aplicado                                                 | `npx prisma migrate deploy` desde el ordenador (ver «Datos iniciales»)              |
| Compilación: `Cannot find module 'dotenv/config'`                                          | Instalación solo de producción y `prisma.config.ts` importaba `dotenv`                | `prisma.config.ts` carga `.env` con la función de Node; `dotenv` eliminado          |
| Compilación: `Could not find a declaration file for module 'express'` (y `cors`, `pdfkit`) | Los `@types/…` estaban solo en desarrollo                                             | Movidos a `dependencies`, igual que `typescript` y `prisma`                         |
| Pedidos que se quedaban en «Listo» / transacciones canceladas                              | API (EE. UU.) y base de datos (Irlanda) en regiones distintas; plazo de 5 s de Prisma | Región EU West y `transactionOptions` de 30 s                                       |
| Pedidos a domicilio sin completar                                                          | La cocina no podía cerrarlos y desaparecían de su pantalla                            | Columna «En reparto» y botón «Entregado al cliente» en la cocina                    |
| Google: `redirect_uri_mismatch`                                                            | La URI autorizada en Google llevaba un carácter de más                                | Dejarla exactamente igual que la de Supabase                                        |
| El registro no enviaba correo                                                              | «Confirm email» desactivado en Supabase                                               | Activarlo (y configurar el SMTP de Resend)                                          |
| «El enlace de confirmación no es válido o ha caducado» al pulsar                           | Un analizador de enlaces del correo gastaba el código de un solo uso                  | El enlace lleva a `/confirmar-correo`, con un botón que gasta el código             |
| Logo roto en el correo                                                                     | Cliente de correo que bloquea imágenes externas                                       | PNG servido desde la web; si se bloquea, se lee «FORNEA Pizzeria»                   |
| «Este correo ya está asociado a otra cuenta» tras borrar un usuario en Supabase            | Perfil huérfano en la base con ese correo                                             | SQL de «Liberar un correo»                                                          |
| Vercel no valida el dominio                                                                | Registros de aparcamiento de DonDominio (`ANAME`, `CNAME www`) compitiendo            | Borrar el `ANAME` y editar el `CNAME www`                                           |
| Los visitantes veían los pedidos de otros                                                  | Todos son administradores en la demostración y el panel mostraba todos los pedidos    | Los administradores que no son el propietario solo ven y mueven sus propios pedidos |

## Pendiente (no bloquea la demostración)

- Datos del titular en los textos legales (`frontend/src/lib/legal.ts`) y revisión de un profesional.
- Autoservicio de borrado y exportación de datos del usuario (hoy se atiende a mano).
- `Content-Security-Policy` en la web.
- Stripe en modo real y cuenta activada, el día que se quiera cobrar.
- Copias automáticas de la base de datos: el plan gratuito de Supabase no las incluye; mientras, copia
  manual semanal con `scripts/backup-produccion.ps1`.
