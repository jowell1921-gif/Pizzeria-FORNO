# Catálogo de errores de la API

Todo error tiene la misma forma, con un código estable que la app puede usar para decidir qué hacer
(el `message` está en inglés y es solo para depurar: **no se muestra al usuario**; la app pone sus propios
textos):

```json
{
  "error": {
    "code": "BELOW_MINIMUM_ORDER",
    "message": "…",
    "details": { "minimumOrder": "12.00" },
    "requestId": "…"
  }
}
```

`requestId` coincide con la cabecera `X-Request-Id`: pídele al usuario que lo comunique si reclama.
Una prueba automática comprueba que **todos** los códigos que lanza el servidor están en este archivo.

## Reglas generales para la app

| Estado        | Qué hacer                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `401`         | Renovar la sesión una vez y reintentar (ver `README.md`). Si vuelve a fallar, cerrar sesión                                                 |
| `403`         | No reintentar: falta permiso o la cuenta está desactivada                                                                                   |
| `404`         | No existe, **o es de otra persona** (el servidor no distingue a propósito)                                                                  |
| `409` / `422` | Error de negocio: mostrar un texto claro al usuario según el código; no reintentar igual                                                    |
| `429`         | Esperar lo que indique `Retry-After` (segundos) y reintentar                                                                                |
| `5xx` y red   | Reintentar con espera creciente (máx. 3 veces). Los `POST` de pedidos y canjes son seguros de reintentar **con la misma `Idempotency-Key`** |

## Sesión y cuenta

| Código                | HTTP | Cuándo                                                         | La app                                              |
| --------------------- | ---- | -------------------------------------------------------------- | --------------------------------------------------- |
| `UNAUTHENTICATED`     | 401  | Falta el token                                                 | Ir a iniciar sesión                                 |
| `TOKEN_EXPIRED`       | 401  | El access token ha caducado                                    | `refreshSession()` de Supabase y reintentar una vez |
| `INVALID_TOKEN`       | 401  | Token falso, de otro proyecto o mal firmado                    | Cerrar sesión                                       |
| `ACCOUNT_DISABLED`    | 403  | La cuenta está desactivada                                     | Mostrar «cuenta desactivada»                        |
| `ACCOUNT_CONFLICT`    | 409  | El correo ya pertenece a otra cuenta de FORNO                  | Pedir que use el método de acceso original          |
| `FORBIDDEN`           | 403  | Sin permiso para esa operación                                 | No mostrar la opción                                |
| `PROFILE_INCOMPLETE`  | 422  | Falta nombre de usuario o teléfono para pedir                  | Llevar a «Completar mis datos»                      |
| `ADDRESS_LIMIT`       | 409  | Máximo de direcciones guardadas                                | Pedir que borre una                                 |
| `SELF_ADMIN_DISABLED` | 403  | La opción de demostración «hazte administrador» no está activa | Ocultarla                                           |

## Pedido y checkout

| Código                       | HTTP | Cuándo                                                        | La app                                           |
| ---------------------------- | ---- | ------------------------------------------------------------- | ------------------------------------------------ |
| `ORDERS_PAUSED`              | 409  | El local ha pausado los pedidos                               | Mostrar el mensaje del local (`/store/settings`) |
| `STORE_CLOSED`               | 409  | Cerrado y se pidió «lo antes posible»                         | Obligar a elegir una franja                      |
| `STORE_NOT_CONFIGURED`       | 503  | El local no está configurado                                  | Mostrar «no disponible»                          |
| `ORDER_TYPE_UNAVAILABLE`     | 409  | Recogida o reparto desactivado                                | Ocultar esa modalidad                            |
| `INVALID_SCHEDULE`           | 422  | La hora elegida ya no es una franja válida                    | Recargar `/store/slots`                          |
| `OUTSIDE_DELIVERY_ZONE`      | 422  | No se reparte en ese código postal                            | Elegir otra dirección o recoger                  |
| `BELOW_MINIMUM_ORDER`        | 422  | Pedido inferior al mínimo de la zona (`details.minimumOrder`) | Pedir que añada productos                        |
| `ADDRESS_NOT_FOUND`          | 422  | La dirección no existe o no es suya                           | Recargar direcciones                             |
| `PAYMENT_METHOD_UNAVAILABLE` | 409  | Método de pago no activo                                      | Recargar `/store/settings`                       |
| `PAYMENT_METHOD_MISMATCH`    | 422  | Efectivo que no corresponde a la modalidad                    | Corregir el método                               |
| `INVALID_ORDER_TOTAL`        | 422  | El total no es válido (≤ 0)                                   | Revisar el pedido                                |
| `PRODUCT_NOT_FOUND`          | 422  | Un producto ya no existe                                      | Quitarlo del carrito                             |
| `PRODUCT_UNAVAILABLE`        | 422  | Producto agotado                                              | Quitarlo o avisar                                |
| `OPTION_UNAVAILABLE`         | 422  | Una opción está agotada                                       | Reelegir la opción                               |
| `INVALID_OPTIONS`            | 422  | Opciones fuera de las reglas del producto                     | Reelegir opciones                                |
| `CART_CONFLICT`              | 409  | El carrito del servidor cambió a la vez                       | Volver a leer `/cart`                            |
| `PROMOTION_CHANGED`          | 409  | La promoción automática dejó de cumplirse al confirmar        | Volver a pedir el presupuesto                    |
| `CANNOT_CANCEL`              | 409  | El local ya empezó a prepararlo                               | Indicar que llame al local                       |
| `INVALID_TRANSITION`         | 409  | Cambio de estado no permitido (solo personal)                 | Recargar el pedido                               |
| `IDEMPOTENCY_KEY_REQUIRED`   | 400  | Falta la cabecera `Idempotency-Key`                           | Error de programación                            |
| `IDEMPOTENCY_KEY_REUSED`     | 422  | La misma clave con otro cuerpo                                | Generar una clave nueva                          |
| `REQUEST_IN_PROGRESS`        | 409  | La misma petición sigue ejecutándose                          | Esperar y consultar «Mis pedidos»                |

## Cupones, recompensas y puntos

| Código                     | HTTP | Cuándo                                | La app                         |
| -------------------------- | ---- | ------------------------------------- | ------------------------------ |
| `COUPON_NOT_FOUND`         | 422  | El código no existe                   | «Cupón no válido»              |
| `COUPON_INACTIVE`          | 422  | Desactivado                           | «Cupón no disponible»          |
| `COUPON_NOT_STARTED`       | 422  | Aún no vigente                        | Indicar la fecha de inicio     |
| `COUPON_EXPIRED`           | 422  | Caducado                              | «Cupón caducado»               |
| `COUPON_USED_UP`           | 422  | Agotado (límite global)               | «Cupón agotado»                |
| `COUPON_ALREADY_USED`      | 422  | El usuario ya lo usó                  | «Ya lo has usado»              |
| `COUPON_NOT_FIRST_ORDER`   | 422  | Solo para el primer pedido            | «Solo para tu primer pedido»   |
| `COUPON_MIN_SUBTOTAL`      | 422  | No llega al importe mínimo            | Indicar el mínimo              |
| `COUPON_NOT_APPLICABLE`    | 422  | No aplica a estos productos           | «No aplica a tu pedido»        |
| `REWARD_NOT_APPLICABLE`    | 422  | La recompensa no aplica a este pedido | Quitarla                       |
| `REDEMPTION_NOT_AVAILABLE` | 409  | Recompensa ya usada o de otra persona | Recargar «Mis recompensas»     |
| `REWARD_OUT_OF_STOCK`      | 409  | Recompensa agotada                    | Recargar recompensas           |
| `INSUFFICIENT_POINTS`      | 409  | Saldo insuficiente para canjear       | «No tienes puntos suficientes» |

## Pagos, documentos y correos

| Código                    | HTTP | Cuándo                                            | La app                                           |
| ------------------------- | ---- | ------------------------------------------------- | ------------------------------------------------ |
| `PAYMENTS_NOT_CONFIGURED` | 409  | El pago online no está disponible                 | Ofrecer solo efectivo                            |
| `ORDER_NOT_PAYABLE`       | 409  | El pedido no espera un pago online                | Recargar el pedido                               |
| `PAYMENT_IN_PROGRESS`     | 409  | El pago se está confirmando                       | Esperar y consultar el pedido                    |
| `PAYMENT_PROVIDER_ERROR`  | 502  | Stripe no responde                                | Reintentar más tarde (el pedido sigue pendiente) |
| `INVALID_SIGNATURE`       | 400  | Webhook sin firma válida (solo Stripe)            | —                                                |
| `DOCUMENT_NOT_AVAILABLE`  | 409  | Ticket o factura de un pedido aún no cobrado      | Ocultar la descarga                              |
| `CUSTOMER_DATA_REQUIRED`  | 409  | Faltan datos fiscales para la factura             | Pedirlos                                         |
| `NOT_REFUNDABLE`          | 409  | El pago no se puede reembolsar (personal)         | —                                                |
| `INVALID_REFUND_AMOUNT`   | 422  | Importe a devolver superior al posible (personal) | —                                                |

## Asistente PizzAI

| Código                     | HTTP | Cuándo                           | La app                                 |
| -------------------------- | ---- | -------------------------------- | -------------------------------------- |
| `ASSISTANT_NOT_CONFIGURED` | 503  | El servidor no tiene IA          | Usar el modo de demostración, rotulado |
| `ASSISTANT_LIMIT_REACHED`  | 429  | Tope diario alcanzado            | «Vuelve mañana»                        |
| `ASSISTANT_BUSY`           | 503  | El proveedor de IA está saturado | Reintentar en un momento               |
| `ASSISTANT_ERROR`          | 502  | Fallo del proveedor              | «No he podido responder»               |

## Generales

| Código              | HTTP | Cuándo                                         | La app                                          |
| ------------------- | ---- | ---------------------------------------------- | ----------------------------------------------- |
| `VALIDATION_ERROR`  | 400  | Datos no válidos (`details` indica qué campos) | Marcar los campos                               |
| `INVALID_JSON`      | 400  | El cuerpo no es JSON                           | Error de programación                           |
| `PAYLOAD_TOO_LARGE` | 413  | Cuerpo de más de 100 kB                        | Error de programación                           |
| `NOT_FOUND`         | 404  | No existe o es de otra persona                 | «No encontrado»                                 |
| `RATE_LIMITED`      | 429  | Demasiadas peticiones                          | Respetar `Retry-After`                          |
| `NOT_READY`         | 503  | La base de datos no responde (`/health/ready`) | Reintentar                                      |
| `INTERNAL_ERROR`    | 500  | Error inesperado                               | Reintentar y mostrar el `requestId` si persiste |

## Solo para el personal (panel y cocina)

La app de clientes no los recibe; se documentan por completitud.

| Código                           | HTTP | Cuándo                                               |
| -------------------------------- | ---- | ---------------------------------------------------- |
| `KITCHEN_TRANSITION_NOT_ALLOWED` | 403  | La cocina intentó un cambio que no le corresponde    |
| `REASON_REQUIRED`                | 422  | Falta el motivo (rechazar, devolver, ajustar puntos) |
| `ORDER_NOT_COMPLETED`            | 409  | Operación que exige un pedido completado             |
| `LAST_ADMIN`                     | 409  | Se intentó quitar el último administrador            |
| `CATEGORY_HAS_PRODUCTS`          | 409  | Borrar una categoría que aún tiene productos         |
| `CATEGORY_NOT_FOUND`             | 422  | Categoría inexistente                                |
| `UNKNOWN_ALLERGEN`               | 422  | Alérgeno que no existe                               |
| `INVALID_OPTION`                 | 422  | Opción de producto no válida                         |
| `INVALID_OPTION_GROUP`           | 422  | Grupo de opciones no válido                          |
| `NO_ORDER_TYPE`                  | 422  | Debe quedar activa al menos una modalidad            |
| `SPECIAL_DAY_EXISTS`             | 409  | Ya hay un día especial en esa fecha                  |
| `POSTAL_CODE_IN_USE`             | 422  | Código postal ya asignado a otra zona                |
| `COUPON_CODE_EXISTS`             | 409  | Código de cupón repetido                             |
| `COUPON_HAS_USES`                | 409  | No se puede borrar un cupón ya usado                 |
| `CUSTOMER_NOT_FOUND`             | 422  | Cliente inexistente                                  |
| `IMAGE_REQUIRED`                 | 400  | Falta la imagen                                      |
| `INVALID_IMAGE`                  | 400  | La imagen no es JPEG, PNG ni WebP                    |
| `STORAGE_NOT_CONFIGURED`         | 503  | La subida de fotos no está configurada               |
| `STORAGE_ERROR`                  | 502  | Fallo al guardar la imagen                           |
