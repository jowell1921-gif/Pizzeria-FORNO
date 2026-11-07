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

Llegan en sus fases: creación de pedidos y carrito (6), canjes y validación de cupones (7),
administración y cocina (8), pagos y webhooks (9).

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
