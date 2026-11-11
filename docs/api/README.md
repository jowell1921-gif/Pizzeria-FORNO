# API REST de FORNO (v1)

Base: `/api/v1`. La documentación interactiva (Swagger UI) está en `/api/v1/docs` y el contrato
OpenAPI 3.1 en `/api/v1/openapi.json`. Se publican en desarrollo y pruebas; en producción hay que
activarlas con `API_DOCS_ENABLED=true`.

Las respuestas están definidas una sola vez en `backend/src/docs/schemas.ts`. De ahí salen la
documentación y las pruebas de contrato (`backend/tests/api/contract.test.ts`), de modo que el
contrato y el servidor no pueden separarse sin que una prueba falle.

## Convenciones

| Tema            | Regla                                                                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Éxito           | `{ "data": … }`; en listas paginadas `{ "data": […], "meta": { page, pageSize, total, totalPages } }`                                               |
| Error           | `{ "error": { "code", "message", "details?", "requestId" } }`. `requestId` coincide con la cabecera `X-Request-Id` y con el registro del servidor   |
| Importes        | Cadenas decimales con dos decimales (`"9.50"`), IVA incluido. Nunca números de coma flotante                                                        |
| Fechas          | ISO 8601 en UTC (`2026-11-07T10:00:00.000Z`). Los horarios del local se expresan en minutos desde las 00:00 en la zona horaria `timezone` del local |
| Identificadores | UUID, salvo `orderNumber` (entero correlativo visible para el cliente)                                                                              |
| Paginación      | `?page=1&pageSize=10` (máximo 50). El catálogo no se pagina: es una lista acotada                                                                   |
| Autenticación   | `Authorization: Bearer <access token de Supabase>`. El servidor verifica la firma; el cliente nunca envía su identidad ni su rol                    |
| Idempotencia    | Los `POST` que creen pedidos o canjes (fases 6 y 7) aceptarán la cabecera `Idempotency-Key`                                                         |
| Caché           | Los datos públicos (carta, promociones, local, zonas) llevan `Cache-Control: public, max-age=30`                                                    |

## Códigos de estado

`200` correcto · `201` creado · `204` sin contenido · `400` datos no válidos (`VALIDATION_ERROR`,
`INVALID_JSON`) · `401` sin sesión o token no válido · `403` sin permiso o cuenta desactivada ·
`404` no existe (también si pertenece a otra persona) · `409` conflicto (`ACCOUNT_CONFLICT`, límite de
direcciones) · `413` cuerpo demasiado grande (100 kB) · `429` demasiadas peticiones (`Retry-After`) ·
`500` error inesperado · `503` local sin configurar.

## Endpoints (fase 5)

Públicos:

| Método y ruta                                | Descripción                                                |
| -------------------------------------------- | ---------------------------------------------------------- |
| `GET /health`                                | Estado del servicio                                        |
| `GET /categories`                            | Categorías activas                                         |
| `GET /products?category=pizzas&popular=true` | Carta (los no disponibles se marcan `available: false`)    |
| `GET /products/{idOrSlug}`                   | Producto con opciones, ingredientes y alérgenos            |
| `GET /promotions`                            | Promociones vigentes y su cupón público                    |
| `GET /store/settings`                        | Datos públicos del local, horarios y si está abierto ahora |
| `GET /delivery-zones`                        | Zonas de reparto                                           |
| `GET /delivery-zones/check?postalCode=28001` | ¿Se reparte en ese código postal?                          |

Con sesión (`Authorization`): `GET`/`PATCH /me`, `GET`/`POST /me/addresses`,
`PATCH`/`DELETE /me/addresses/{id}`, `GET /loyalty/account`, `GET /loyalty/transactions`,
`GET /loyalty/rewards`, `GET /orders/me`, `GET /orders/{id}`.

Pedidos (fase 6):

| Método y ruta                  | Descripción                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `GET /store/slots?type=&date=` | Franjas horarias seleccionables y si se puede pedir «lo antes posible». Sin caché |
| `POST /checkout/quote`         | Presupuesto del carrito (líneas, IVA, envío, total, puntos estimados). Público    |
| `GET /cart`, `PUT /cart`       | Carrito guardado del usuario (solo producto, opciones y cantidad; nunca precios)  |
| `POST /orders`                 | Crea un pedido. Exige `Idempotency-Key`                                           |

El cliente solo envía **identificadores y cantidades**: cualquier campo de precio, total o envío se
rechaza con `400`. El servidor recalcula precios, IVA, gastos de envío, mínimo de la zona, horario,
franja y método de pago. Se admite efectivo (`CASH_PICKUP` en recogida, `CASH_DELIVERY` a domicilio) y, con la
pasarela configurada, `ONLINE` (el pedido nace `PENDING_PAYMENT` hasta que Stripe confirma el cobro);
`/store/settings` solo anuncia los métodos de pago que se pueden usar de verdad.

Errores de negocio al crear un pedido (`error.code`): `PROFILE_INCOMPLETE`, `ORDERS_PAUSED`,
`STORE_CLOSED`, `ORDER_TYPE_UNAVAILABLE`, `PAYMENT_METHOD_UNAVAILABLE`, `PAYMENT_METHOD_MISMATCH`,
`OUTSIDE_DELIVERY_ZONE`, `BELOW_MINIMUM_ORDER`, `INVALID_SCHEDULE`, `ADDRESS_NOT_FOUND`,
`PRODUCT_NOT_FOUND`, `PRODUCT_UNAVAILABLE`, `INVALID_OPTIONS`, `OPTION_UNAVAILABLE`.

Idempotencia: repetir la misma petición con la misma clave devuelve el mismo pedido (cabecera
`Idempotent-Replayed: true`) sin crear otro; la misma clave con otro cuerpo da `422
IDEMPOTENCY_KEY_REUSED`; mientras la primera sigue en curso, `409 REQUEST_IN_PROGRESS`. Una petición
fallida no gasta la clave. Las claves caducan a las 24 h.

FORNO CLUB y promociones (fase 7):

| Método y ruta                      | Descripción                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `GET /loyalty/program`             | Público: regla de puntos por euro, caducidad y recompensas                                            |
| `GET /loyalty/redemptions?status=` | Mis recompensas canjeadas (disponibles, usadas, canceladas)                                           |
| `POST /loyalty/redemptions`        | Canjea una recompensa. Exige `Idempotency-Key`. Errores: `INSUFFICIENT_POINTS`, `REWARD_OUT_OF_STOCK` |
| `POST /orders/{id}/cancel`         | El cliente cancela su pedido mientras es `NEW`                                                        |

`POST /checkout/quote` y `POST /orders` aceptan `couponCode` y `redemptionId`. Con cupón o recompensa
exigen sesión (`Authorization`). El servidor valida y calcula el descuento; el cliente nunca envía
importes. Errores de descuento (`422`): `COUPON_NOT_FOUND`, `COUPON_INACTIVE`, `COUPON_EXPIRED`,
`COUPON_NOT_STARTED`, `COUPON_MIN_SUBTOTAL`, `COUPON_NOT_FIRST_ORDER`, `COUPON_USED_UP`,
`COUPON_ALREADY_USED`, `COUPON_NOT_APPLICABLE`, `REDEMPTION_NOT_AVAILABLE`, `REWARD_NOT_APPLICABLE`.
El presupuesto devuelve `discounts` (descripción e importe de cada uno).

Los puntos se conceden solo cuando el pedido se completa y se revierten al cancelarlo (ver
`docs/decisions/0008-fidelizacion-y-promociones.md`).

Personal y cocina (fase 8A). Todas exigen sesión y un permiso explícito:

| Método y ruta                          | Permiso                                  | Descripción                                                        |
| -------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| `GET /admin/dashboard`                 | `dashboard:read`                         | Resumen del día                                                    |
| `GET /admin/orders`                    | `orders:read:all`                        | Pedidos con filtros (`status`, `type`, `date`, `q`) y paginación   |
| `GET /admin/orders/{id}`               | `orders:read:all`                        | Detalle completo y estados siguientes (`allowedNext`)              |
| `PATCH /admin/orders/{id}/status`      | `orders:update-status`                   | Cambia el estado (`409 INVALID_TRANSITION`, `422 REASON_REQUIRED`) |
| `GET /kitchen/orders`                  | `kitchen:orders:read`                    | Pedidos para cocina, sin datos del cliente, importes ni pagos      |
| `PATCH /kitchen/orders/{id}/status`    | `kitchen:orders:update-status`           | Avanzar un pedido (aceptar, preparar, listo, entregar en recogida) |
| `GET /admin/stream`, `/kitchen/stream` | `orders:read:all`, `kitchen:orders:read` | Avisos en directo (SSE) con `fetch` y `Authorization`              |

Administración del negocio (fase 8B). Todas exigen sesión y el permiso indicado; cada escritura se valida en el servidor y queda en la auditoría con los valores antes y después:

| Método y ruta                                                             | Permiso             | Descripción                                                                               |
| ------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------- |
| `GET/POST /admin/categories`, `PATCH/DELETE /admin/categories/{id}`       | `catalog:manage`    | Categorías (borrado lógico; `409 CATEGORY_HAS_PRODUCTS`)                                  |
| `GET /admin/allergens`                                                    | `catalog:manage`    | Catálogo de alérgenos (por código)                                                        |
| `GET/POST /admin/products`, `GET/PATCH/DELETE /admin/products/{id}`       | `catalog:manage`    | Productos con ingredientes, alérgenos, imagen y grupos de opciones; `POST …/restore`      |
| `POST /admin/uploads/product-image`                                       | `catalog:manage`    | Foto (JPEG/PNG/WebP, máx. 3 MB, cuerpo binario). `503 STORAGE_NOT_CONFIGURED` sin Storage |
| `GET/PATCH /admin/store/settings`                                         | `settings:manage`   | Datos, tiempos, modalidades, pausa de pedidos y métodos de pago                           |
| `GET/PUT /admin/store/opening-hours`                                      | `settings:manage`   | Horario semanal (se reemplaza completo; sin solapes)                                      |
| `GET/POST /admin/store/special-days`, `DELETE …/{id}`                     | `settings:manage`   | Festivos y horarios especiales (`409 SPECIAL_DAY_EXISTS`)                                 |
| `GET/POST /admin/delivery-zones`, `PATCH/DELETE …/{id}`                   | `settings:manage`   | Zonas de reparto, envío y mínimo (`422 POSTAL_CODE_IN_USE`)                               |
| `GET/POST /admin/promotions`, `GET/PATCH/DELETE …/{id}`                   | `promotions:manage` | Descuentos y combos, con o sin código (`automatic`)                                       |
| `POST /admin/promotions/{id}/coupons`, `PATCH/DELETE /admin/coupons/{id}` | `promotions:manage` | Cupones (`409 COUPON_CODE_EXISTS`, `409 COUPON_HAS_USES`)                                 |
| `GET/PATCH /admin/loyalty/settings`                                       | `loyalty:manage`    | Puntos por euro y caducidad                                                               |
| `GET/POST /admin/rewards`, `PATCH/DELETE …/{id}`                          | `loyalty:manage`    | Recompensas (producto gratis o descuento fijo)                                            |
| `GET /admin/loyalty/transactions`, `/admin/loyalty/redemptions`           | `loyalty:manage`    | Libro de movimientos y canjes, con filtros y paginación                                   |
| `GET /admin/customers`                                                    | `customers:read`    | Clientes con saldo (búsqueda por nombre, correo o teléfono)                               |
| `POST /admin/loyalty/adjustments`                                         | `loyalty:manage`    | Ajuste de puntos con motivo obligatorio (nunca se edita el saldo directamente)            |
| `GET /admin/audit`                                                        | `audit:read`        | Registro de operaciones (`entityType`, `action`, `actorId`, `entityId`) paginado          |

Pagos, documentos y correos (fase 9):

| Método y ruta                                  | Permiso           | Descripción                                                                           |
| ---------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------- |
| `POST /orders/{id}/payment-session`            | sesión            | Inicia (o reutiliza) el pago online de un pedido pendiente: devuelve la URL de Stripe |
| `POST /webhooks/stripe`                        | firma de Stripe   | Confirma pagos, fallos, caducidades y devoluciones (solo lo llama Stripe)             |
| `GET /orders/{id}/documents`                   | sesión            | Si el pedido está cobrado y qué documentos tiene                                      |
| `GET /orders/{id}/documents/{ticket\|invoice}` | sesión            | PDF del ticket (se emite al pedirlo) o de la factura (ya solicitada)                  |
| `POST /orders/{id}/invoice`                    | sesión            | Emite la factura con los datos fiscales (`name`, `taxId`, `address`)                  |
| `POST /admin/orders/{id}/refund`               | `payments:refund` | Reembolso total o parcial (`amount` opcional, `reason` obligatorio)                   |
| `GET /admin/orders/{id}/documents/{type}`      | `orders:read:all` | PDF de un pedido para el personal                                                     |
| `GET /admin/notifications`                     | `settings:manage` | Correos de pedido enviados o registrados (filtros `status`, `template`, `q`)          |

Un pedido con `paymentMethod: "ONLINE"` nace `PENDING_PAYMENT`; solo el webhook verificado lo pasa a `NEW`. Errores: `409 PAYMENTS_NOT_CONFIGURED`, `409 ORDER_NOT_PAYABLE`, `409 PAYMENT_IN_PROGRESS`, `409 DOCUMENT_NOT_AVAILABLE`, `422 INVALID_REFUND_AMOUNT`, `502 PAYMENT_PROVIDER_ERROR`.

Solo demostración: `PUT /me/admin-role` y `DELETE /me/admin-role` (sesión) hacen que el propio usuario se haga o deje de ser administrador. Responden `403 SELF_ADMIN_DISABLED` si el servidor tiene `SELF_ADMIN_ENABLED=false` (por defecto está activo, al ser una demostración). La cocina puede pasar un pedido a domicilio listo a `OUT_FOR_DELIVERY` (`PATCH /kitchen/orders/{id}/status`).

## Ejemplos

```bash
curl "http://localhost:4000/api/v1/delivery-zones/check?postalCode=28001"
```

```json
{
  "data": {
    "postalCode": "28001",
    "covered": true,
    "zone": {
      "id": "…",
      "name": "Centro (ejemplo)",
      "postalCodes": ["28001", "28002", "28003"],
      "deliveryFee": "2.50",
      "minimumOrder": "12.00",
      "estimatedMinutes": 35
    }
  }
}
```

```bash
curl http://localhost:4000/api/v1/me -H "Authorization: Bearer $ACCESS_TOKEN"
```

Error de validación:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is not valid",
    "details": [
      { "path": "postalCode", "message": "Postal code must have 5 digits" }
    ],
    "requestId": "5f0c6d52-9a9e-4d4f-9a3b-2a1f0b6f2f10"
  }
}
```

## Límites de peticiones

| Límite                                                    | Valor por defecto |
| --------------------------------------------------------- | ----------------- |
| Por IP, a toda la API (`/health` excluido)                | 300 por minuto    |
| Por usuario autenticado                                   | 240 por minuto    |
| Escrituras (`POST`, `PATCH`, `PUT`, `DELETE`) por usuario | 30 por minuto     |

Las respuestas incluyen las cabeceras `RateLimit` y `RateLimit-Policy`; al superar un límite, `429` con
`Retry-After`. Detrás de un proxy (Railway) hay que configurar `TRUST_PROXY=1`; si no, todos los
visitantes comparten la misma IP.

## Para la app Flutter

Mismo proyecto de Supabase (`supabase_flutter`): se obtiene el access token de la sesión y se envía
como `Bearer`. La renovación de la sesión la gestiona el SDK de Supabase. Los errores se interpretan
por `error.code`, nunca por el texto del mensaje. La carta, las zonas y los horarios no requieren sesión.
