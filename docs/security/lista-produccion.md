# Seguridad y cumplimiento para producción

Complementa la lista de salida de [`../deployment/README.md`](../deployment/README.md). Resume qué
protege ya el proyecto, qué debe decidir el propietario y qué queda pendiente de mejora.

## Qué protege ya el proyecto

- **Identidad y permisos** siempre en el servidor: la API verifica la firma de cada token de Supabase
  y lee los roles y permisos de la base de datos. Nada de lo que envíe el cliente cuenta.
- **Precios, descuentos, envío, puntos y estado de pago** los calcula y valida el servidor.
- **Un pedido solo se paga con un evento verificado de Stripe** (firma, importe y moneda), nunca por
  una redirección del navegador.
- **Datos del cliente**: cada cliente solo ve lo suyo; la cocina no recibe datos personales ni
  importes; el panel exige permisos explícitos por área; las operaciones del personal quedan en el
  registro de auditoría, que no se puede modificar.
- **Base de datos**: RLS activado en todas las tablas sin políticas (los clientes de Supabase no
  acceden a ellas), restricciones de integridad, libro de puntos y facturas inmutables.
- **Transporte y cabeceras**: HTTPS (Vercel y Railway), Helmet en la API y cabeceras de seguridad en la
  web (`nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS), CORS limitado a
  la web, límites de peticiones por IP y por usuario, tamaño máximo de cuerpo.
- **Secretos**: ninguno en Git ni en el navegador (verificado en el historial); la clave secreta de
  Supabase, la de Stripe y la de IA solo existen en el servicio de la API.
- **Auditoría automática** de toda la superficie de la API en cada ejecución de las pruebas
  (`backend/tests/api/security-audit.test.ts`).

## Decisiones del propietario antes de publicar

| Decisión                        | Recomendación                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OWNER_EMAIL`                   | Pon el correo del propietario: solo él modifica carta, promociones, FORNEA CLUB y local; los demás administradores lo ven en solo lectura              |
| `SELF_ADMIN_ENABLED`            | `false` en un negocio real. Con `true`, **cualquier cliente puede hacerse administrador y ver los datos de todos**. Solo para una demostración pública |
| Claves de Stripe                | `sk_live_` para cobrar de verdad; con `sk_test_` los pagos no son reales (el arranque lo avisa)                                                        |
| Correo                          | Dominio verificado en Resend para enviar a los clientes; sin él, los avisos solo se registran                                                          |
| Documentación de la API pública | Desactivada en producción (por defecto). La app Flutter y los desarrolladores la tienen en el repositorio                                              |

## <a id="legal"></a>Datos legales que debe aportar el titular

Las páginas legales (`/legal/...`) contienen **marcadores**, no textos definitivos: el proyecto no
inventa datos del titular ni afirma cumplir la ley por sí solo. Antes de publicar hay que sustituir
los marcadores por los datos reales y que un profesional revise los textos:

- Razón social o nombre del titular, NIF/CIF, domicilio social, correo y teléfono, y datos del
  Registro Mercantil si procede (aviso legal, LSSI-CE).
- Política de privacidad (RGPD/LOPDGDD): responsable, finalidades, base legal, plazos de
  conservación, destinatarios (Supabase, Stripe, Resend, proveedor de IA si se activa), derechos y
  contacto. Los clientes registrados y sus pedidos son datos personales.
- Política de cookies, si se añaden cookies no esenciales (hoy solo se usan las de sesión de acceso).
- Condiciones de compra: precios con IVA incluido, gastos de envío, devoluciones y reclamaciones.
- Información de **alérgenos** de cada producto, que el negocio debe mantener correcta desde el panel.
- En la configuración del local (panel → Establecimiento): razón social y NIF, que aparecen en los
  tickets y las facturas.
- Si se activa PizzAI con IA: informar de que se usa un proveedor externo y de que no debe
  introducirse información personal en el chat.

## Pendiente de mejora (no bloquea)

| Mejora                                                 | Motivo                                                                                                                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Content-Security-Policy` en la web                    | Exige nonces para los scripts de Next.js; se añadió el resto de cabeceras                                                                                   |
| Registro de errores centralizado (por ejemplo, Sentry) | Hoy los errores quedan en el registro JSON de Railway; un servicio de errores avisaría antes. Añade un tercero y datos personales: decisión del propietario |
| Varias réplicas de la API                              | Requiere mover el bus de eventos a Redis o a `LISTEN/NOTIFY`                                                                                                |
| Facturas rectificativas                                | Un pedido reembolsado conserva su ticket original                                                                                                           |
| Doble factor para el personal                          | Supabase lo admite; hoy el acceso es correo y contraseña o Google                                                                                           |
