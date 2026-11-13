# Despliegue de FORNEA

Guía para publicar FORNEA en producción con la infraestructura prevista: **Vercel** (web),
**Railway** (API) y **Supabase** (PostgreSQL, autenticación y almacenamiento de imágenes), con
**Stripe** para los pagos y **Resend** (opcional) para el correo.

> **Estado:** todo está preparado y comprobado en local, pero **no se ha publicado nada ni se ha
> modificado ningún servicio externo**. Cada paso de esta guía lo ejecuta el propietario, con sus
> propias cuentas. Los nombres de los menús de Vercel, Railway, Supabase y Stripe cambian con
> frecuencia: ante una diferencia, manda la documentación oficial de cada plataforma.

## Qué hay preparado

| Pieza                                                                                                   | Dónde                                                | Comprobación hecha                                                             |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| Compilación y arranque de la API como en producción (`npm run build` + `npm start`)                     | `backend/`                                           | Arranca, publica solo lo permitido y responde a `/health`                      |
| Comprobación de vivacidad y de disponibilidad con base de datos                                         | `GET /api/v1/health` y `/health/ready`               | Pruebas automáticas, incluido el caso de base de datos caída                   |
| Aviso de configuración peligrosa al arrancar (claves de prueba, localhost, proxy, administrador libre…) | `configurationWarnings`                              | Pruebas automáticas                                                            |
| Migraciones versionadas y comando de despliegue                                                         | `backend/prisma/migrations`, `backend/railway.json`  | Se aplican desde cero en cada ejecución de las pruebas                         |
| Cabeceras de seguridad de la web y de la API                                                            | `frontend/next.config.ts`, Helmet                    | Pruebas automáticas                                                            |
| Copia de seguridad y restauración                                                                       | [`copias-de-seguridad.md`](./copias-de-seguridad.md) | **Ensayo real hecho**: copia, restauración en otra base y comparación de datos |
| Integración continua                                                                                    | `.github/workflows/ci.yml`                           | Se ejecuta en GitHub al subir cambios                                          |

## Entornos

| Entorno    | Base de datos                           | Web                 | API                 | Stripe                                                               | Correo                                 |
| ---------- | --------------------------------------- | ------------------- | ------------------- | -------------------------------------------------------------------- | -------------------------------------- |
| Desarrollo | PostgreSQL local (Docker, `forno_dev`)  | `localhost:3000`    | `localhost:4000`    | Claves de prueba + `stripe listen`                                   | `log` o Resend a tu dirección          |
| Pruebas    | PostgreSQL local (Docker, `forno_test`) | puertos 3100 y 3200 | puertos 4100 y 4200 | Pasarela simulada                                                    | `log`                                  |
| Producción | Supabase (proyecto de producción)       | Vercel              | Railway             | Claves **reales** (`sk_live_`) o de prueba mientras sea demostración | Resend con dominio verificado, o `log` |

Con una sola base en Supabase para producción no hace falta un segundo proyecto: desarrollo y
pruebas usan el PostgreSQL local de Docker (decisión 5 del propietario). Si más adelante se quiere un
entorno intermedio de ensayo («staging»), se crea otro proyecto de Supabase, otro servicio en
Railway y otro proyecto en Vercel con sus propias variables.

## Orden recomendado

1. **Supabase**: crear el proyecto, aplicar el esquema, configurar acceso y almacenamiento
   ([`servicios-externos.md`](./servicios-externos.md#supabase)).
2. **Railway**: crear el servicio de la API desde `backend/` con sus variables
   ([`servicios-externos.md`](./servicios-externos.md#railway-api)).
3. **Vercel**: crear el proyecto de la web desde `frontend/`
   ([`servicios-externos.md`](./servicios-externos.md#vercel-web)).
4. **Dominio y HTTPS** ([`servicios-externos.md`](./servicios-externos.md#dominio-y-https)).
5. **Stripe**: endpoint de webhook de producción y claves ([`servicios-externos.md`](./servicios-externos.md#stripe)).
6. **Correo** (opcional) ([`servicios-externos.md`](./servicios-externos.md#correo-resend)).
7. Volver a **Supabase** y poner las URL definitivas de la web en la autenticación.
8. Recorrer la [lista de salida a producción](#lista-de-salida-a-producción).

Las variables de cada servicio están en [`variables.md`](./variables.md).

## Lista de salida a producción

Antes de dar la web por publicada, comprueba cada punto (y marca el resultado):

- [ ] `GET https://<api>/api/v1/health/ready` responde `ready`.
- [ ] Al arrancar, el registro de Railway **no** muestra líneas `[config] …` (o cada una es intencionada).
- [ ] `SELF_ADMIN_ENABLED=false`, salvo que sea una demostración pública a propósito.
- [ ] La documentación de la API no está publicada (`/api/v1/docs` responde 404).
- [ ] Registro con correo y confirmación, inicio de sesión con Google y recuperación de contraseña funcionan con el dominio definitivo.
- [ ] Un pedido en efectivo recorre pedido → cocina → completado y genera su ticket.
- [ ] Un pedido con tarjeta se paga, llega el webhook (el pedido pasa a «Recibido») y se puede reembolsar.
- [ ] Un usuario sin rol no entra en `/admin` ni en `/kitchen`.
- [ ] El primer administrador real está creado (\`npm run roles -- grant correo ADMIN\` o el SQL de [`supabase-auth.md`](../security/supabase-auth.md)).
- [ ] La subida de fotos funciona (bucket público creado y clave secreta solo en Railway).
- [ ] Las copias de seguridad automáticas están activas y se ha probado una restauración.
- [ ] Los textos legales tienen los datos reales del titular (ver [`../legal`](../security/lista-produccion.md#legal)).
- [ ] Hay un monitor de disponibilidad sobre `/health/ready` y alguien recibe el aviso.

## Si algo sale mal (marcha atrás)

- **Web:** en Vercel, «Promote to Production» sobre el despliegue anterior (inmediato, sin recompilar).
- **API:** en Railway, «Redeploy» del despliegue anterior. **Ojo con las migraciones:** una migración
  ya aplicada no se deshace sola; por eso cada migración debe ser compatible con la versión anterior
  del código (añadir columnas, no quitarlas, hasta que ya no se usen). Si una migración fallara a
  medias, restaurar la copia de seguridad ([`copias-de-seguridad.md`](./copias-de-seguridad.md)).
- **Pagos:** pausar los pedidos desde el panel (Establecimiento → Pedidos online) mientras se arregla.
