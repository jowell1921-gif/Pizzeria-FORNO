# 0008 — FORNO CLUB y promociones (Fase 7)

Fecha: 2026-11-08

## Puntos

| Tema                     | Decisión                                                                                                                                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cuándo se conceden       | Solo cuando el pedido pasa a **completado** (`changeOrderStatus`). Una sola vez por pedido: comprobación previa, índice único en la base de datos y bloqueo de la fila del pedido durante el cambio                                                            |
| Cuánto                   | Puntos = (productos − descuentos) × puntos por euro, **redondeado hacia abajo**, con la regla vigente al completar el pedido. El gasto de envío **nunca** puntúa                                                                                               |
| IVA                      | Los precios incluyen IVA y esa es la cantidad que paga el cliente: **cuenta para los puntos**. Si el local quisiera excluir el IVA de la base, sería una regla comercial explícita (hoy no existe)                                                             |
| Libro de movimientos     | Todo cambio de saldo es un movimiento (`EARN`, `REDEEM`, `REVERSAL`, `ADJUSTMENT`); el saldo no se edita. El trigger de la base de datos bloquea la cuenta, calcula el saldo y rechaza saldos negativos                                                        |
| Cancelación o devolución | Se retiran los puntos ganados **hasta el saldo disponible** (nunca negativo) y se **devuelven completos** los puntos gastados en una recompensa usada en ese pedido (la recompensa pasa a «cancelada»). Es idempotente (índices únicos por pedido y por canje) |
| Ajustes administrativos  | `adjustPoints`: exige motivo, queda en el libro y en `AuditLog`, y no puede dejar el saldo en negativo. Las pantallas y rutas de administración llegan en la fase 8                                                                                            |
| Caducidad de puntos      | Se muestra si el local la configura, pero **el proceso que caduca los puntos no está hecho** (movimientos `EXPIRATION`). Pendiente (fase 8/operación)                                                                                                          |

## Canje de recompensas

- `POST /loyalty/redemptions` descuenta los puntos y deja la recompensa **disponible** en «Mis recompensas»; se usa después en un pedido con `redemptionId`. Así el canje es una operación económica atómica y reversible, separada del pedido.
- **Concurrencia:** el trigger bloquea la cuenta (`FOR UPDATE`); dos canjes simultáneos no pueden gastar los mismos puntos (probado con 5–6 peticiones a la vez). La recompensa solo se usa una vez (actualización condicional `AVAILABLE → USED`), también probado en paralelo.
- **Idempotencia:** `Idempotency-Key` obligatoria; un reintento devuelve el mismo canje sin volver a descontar.
- Stock opcional por recompensa (se repone si el pedido se cancela).
- Beneficio: **producto gratis** (descuenta una unidad del producto, el más barato si hay varios) o **descuento fijo** (nunca por encima de lo que queda por pagar).

## Promociones y cupones

| Tema               | Decisión                                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cómo se aplican    | Solo con **código de cupón** (`couponCode`) y con sesión. El servidor valida: estado, fechas (cupón y promoción), importe mínimo, primer pedido, usos máximos y por cliente (de cupón y de promoción), cupón personal, productos a los que aplica |
| Tipos              | Porcentaje o importe fijo (sobre todo el pedido o solo sobre los productos de la promoción) y **combo** (precio cerrado para los productos y cantidades indicados)                                                                                |
| Combinación        | Un cupón y una recompensa por pedido; el total descontado nunca supera los productos                                                                                                                                                              |
| Carreras           | Al crear el pedido se bloquea la fila del cupón y se vuelven a comprobar los límites dentro de la transacción: 4 pedidos simultáneos con un cupón de un solo uso crean uno                                                                        |
| Pedidos anulados   | Un pedido cancelado o rechazado **no cuenta** para los límites ni para «primer pedido»: el cliente recupera su cupón                                                                                                                              |
| Errores            | Códigos concretos (`COUPON_EXPIRED`, `COUPON_NOT_FIRST_ORDER`, `COUPON_MIN_SUBTOTAL`…) para que la web lo explique. Un cupón personal de otra persona responde como inexistente                                                                   |
| IVA con descuentos | El descuento se reparte entre las líneas antes de extraer el IVA contenido en el total. Las líneas guardan su IVA sin descuento (restricción de la base de datos); `Order.taxTotal` refleja lo realmente pagado                                   |
| Presupuesto        | `POST /checkout/quote` sigue siendo público; con cupón o recompensa exige sesión (autenticación opcional: sin cabecera, anónimo; con cabecera inválida, 401)                                                                                      |
| No incluido        | Promociones **automáticas** (sin código) y descuentos sobre el gasto de envío. «Menú FORNO» y «Envío gratis» de los datos de ejemplo siguen siendo informativas hasta que el administrador las configure (fase 8)                                 |

## Estados del pedido

`changeOrderStatus` es la única vía para cambiar el estado: valida la transición, escribe el historial, fija fechas, cobra o anula el efectivo y ejecuta la fidelización, todo en una transacción con el pedido bloqueado. Transiciones: `NEW → ACCEPTED | REJECTED | CANCELLED`, `ACCEPTED → PREPARING | CANCELLED`, `PREPARING → READY | CANCELLED`, `READY → OUT_FOR_DELIVERY | COMPLETED | CANCELLED`, `OUT_FOR_DELIVERY → COMPLETED | CANCELLED`, `COMPLETED → CANCELLED` (devolución, con motivo). `REJECTED` y `CANCELLED` son finales. El cliente solo puede cancelar su pedido mientras es `NEW` (`POST /orders/{id}/cancel`). Las rutas del personal y la pantalla de cocina usarán este servicio en la fase 8.

## Pendiente

- Rutas y pantallas de administración de recompensas, cupones, promociones y ajustes de puntos (fase 8).
- Caducidad de puntos (proceso periódico).
- Promociones automáticas y descuentos de envío.
