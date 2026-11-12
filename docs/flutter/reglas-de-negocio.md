# Reglas de negocio centralizadas

Todas estas reglas viven **solo en el backend** (`backend/src/modules/…`), con pruebas automáticas. La
web y la app Flutter las consumen y no las duplican. Cuando una regla cambia, cambia en un único sitio.

## Precios e impuestos

- Los precios incluyen IVA. El IVA se **extrae** del total: `IVA = total × tipo / (100 + tipo)` por línea,
  redondeado a céntimos. El gasto de envío tributa al 10 % (simplificación aceptada para la demostración, ver decisión 0004).
- El precio de una línea = precio base del producto + suplementos de las opciones elegidas, por la cantidad.
- Los descuentos se reparten entre las líneas antes de extraer el IVA, de modo que el IVA coincide siempre con lo realmente pagado.
- El cliente envía **identificadores y cantidades**; cualquier campo de precio, total o envío se rechaza (`400`).
- Los importes se guardan como `Decimal` en PostgreSQL y viajan como texto con dos decimales.

## Pedido

| Regla                   | Detalle                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Solo con cuenta         | No existe compra como invitado. Hace falta perfil completo (nombre de usuario y teléfono)                                                                                      |
| Modalidades             | Recogida y/o domicilio, activables desde el panel. El local puede **pausar** los pedidos                                                                                       |
| Horario                 | Franjas calculadas en el servidor (horario semanal, festivos y horarios especiales, zona horaria del local, antelación máxima). Con el local cerrado no hay «lo antes posible» |
| Reparto                 | Solo por código postal de una zona activa. Cada zona tiene su gasto de envío, su pedido mínimo y su tiempo                                                                     |
| Mínimo                  | Si el pedido (tras descuentos) no alcanza el mínimo de la zona, se rechaza (`BELOW_MINIMUM_ORDER`)                                                                             |
| Instantánea             | El pedido copia nombre, precio, opciones, dirección y datos del cliente: cambiar la carta después no altera pedidos anteriores                                                 |
| Idempotencia            | La misma `Idempotency-Key` devuelve el mismo pedido; nunca se crea dos veces                                                                                                   |
| Cancelación del cliente | Solo mientras esté `NEW` o `PENDING_PAYMENT`. Libera cupón, recompensa y puntos                                                                                                |

## Estados y quién puede cambiarlos

`PENDING_PAYMENT → NEW → ACCEPTED → PREPARING → READY → (OUT_FOR_DELIVERY →) COMPLETED`, con
`REJECTED` (solo desde `NEW`) y `CANCELLED` (desde casi cualquier estado; desde `COMPLETED` es una devolución con motivo).

| Quién                   | Qué puede hacer                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| Cliente                 | Cancelar su pedido mientras no esté aceptado                                                          |
| Cocina (`KITCHEN`)      | Aceptar, preparar, marcar listo, entregar en el local (recogida) y entregar al repartidor (domicilio) |
| Personal (`STAFF`)      | Todos los cambios de estado, con motivo en rechazos y devoluciones                                    |
| Administrador (`ADMIN`) | Todo lo anterior, reembolsos, carta, promociones, FORNO CLUB, ajustes del local, auditoría y correos  |
| Sistema                 | Confirmar un pago (webhook firmado de Stripe) y cancelar el pedido si el pago caduca                  |

Cada cambio queda en el historial de estados; los del personal, también en la auditoría. Las transiciones
no permitidas responden `409 INVALID_TRANSITION`.

## Pagos

- Efectivo: el pedido queda con el cobro **pendiente**; se marca cobrado al completarse.
- Tarjeta: solo el **evento firmado de Stripe** pasa un pedido a pagado. Se comprueban importe y moneda; un pago fallido o caducado nunca genera un pedido pagado; un cobro tardío de un pedido cancelado se devuelve solo.
- Reembolsos (total o parcial): solo `ADMIN`, con motivo y auditoría; automáticos si se cancela o rechaza un pedido ya pagado.

## FORNO CLUB (puntos)

- Regla configurable en el panel: **puntos por euro** de productos (sin envío ni descuentos) y caducidad opcional.
- Los puntos se conceden **solo al completar** el pedido y **una sola vez**; si se cancela, se revierten hasta el saldo disponible.
- Toda variación es un movimiento del libro (`LoyaltyTransaction`), que no se puede modificar; el saldo nunca es negativo; no existe edición directa del saldo. Los ajustes manuales exigen motivo y quedan auditados.
- Canje: descuenta el saldo de forma atómica (dos peticiones simultáneas nunca gastan los mismos puntos) y crea una recompensa en «Mis recompensas», que se aplica a un pedido con `redemptionId`. Si el pedido se cancela, los puntos gastados se devuelven íntegros.

## Promociones y cupones

- Tipos: descuento (porcentaje o importe fijo) y combo a precio cerrado; con o sin código; **automáticas** (se aplican solas) o con cupón.
- Restricciones validadas **en el servidor**: fechas, límites de uso (globales y por cliente), importe mínimo, productos, «solo primer pedido» y cupones personales.
- Un cupón escrito gana sobre la promoción automática; la recompensa canjeada se suma. Los límites se vuelven a comprobar con bloqueo al crear el pedido, también con peticiones simultáneas.

## Documentos

- Ticket (factura simplificada) y factura, en PDF, solo con el pedido **cobrado**.
- Numeración correlativa por serie y año (`T-2026-000001`, `F-2026-000001`), atómica y sin saltos; inmutables una vez emitidos.
- La factura se emite una sola vez, a petición del cliente y con sus datos fiscales.

## Seguridad

- La identidad sale del token verificado; los roles y permisos, de la base de datos. Nada de lo que envíe el cliente cuenta.
- Un cliente solo ve y toca lo suyo (si un recurso es de otra persona, la API responde `404`).
- La cocina no recibe datos personales ni importes.
- La clave secreta de Supabase, la de Stripe y la del proveedor de IA solo existen en el backend.

## PizzAI

La IA solo conoce los **datos públicos** de la carta, promociones, reparto, horarios y FORNO CLUB; no accede a
clientes ni pedidos y no puede ejecutar operaciones. Hay límites por IP y un tope diario global.
