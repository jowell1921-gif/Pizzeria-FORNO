# 0007 — Pedidos y checkout (Fase 6)

Fecha: 2026-11-08

| Tema                   | Decisión                                                                                                                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Precios                | Solo en el servidor (`checkout/pricing.ts`), con `Decimal` y redondeo a céntimos «half up» como `round()` de PostgreSQL. El cliente envía producto, opciones y cantidad; los esquemas son estrictos y rechazan cualquier precio                           |
| IVA                    | Precios con IVA incluido; IVA contenido por línea = total·tasa/(100+tasa). **Gasto de envío al 10 %**: simplificación aceptada por el propietario al ser una demostración (ver `0004-iva.md`; antes de un uso comercial real habría que revisarla)        |
| Descuentos             | El cálculo ya contempla `discountTotal` (hoy 0) para no cambiar el contrato; promociones, cupones y canjes llegan en la fase 7                                                                                                                            |
| Presupuesto            | `POST /checkout/quote`, público y sin estado. La web lo usa para mostrar importes; el pedido lo recalcula siempre                                                                                                                                         |
| Carrito                | Zustand con persistencia local (`fornea-cart-v1`) y sincronización con el servidor para quien tiene sesión: al iniciar sesión, si hay carrito local se sube; si no, se recupera el del servidor. Al cerrar sesión se vacía el local. Sin precios guardados |
| Compra solo con cuenta | `/pedido` está protegido en el proxy y la API exige permiso `orders:create` y perfil completo (nombre de usuario y teléfono)                                                                                                                              |
| Horario                | Franjas calculadas en el servidor (`store/scheduling.ts`) con zona horaria del local, días especiales, antelación (preparación o reparto) y límite de días. `scheduledFor` debe ser exactamente una franja ofrecida. Sin hora: solo con el local abierto  |
| Pago                   | Efectivo y, desde la fase 9, pago online (ver 0012). `usablePaymentMethods` oculta el pago online mientras no haya pasarela configurada, aunque el local lo tenga activado. El pedido nace `NEW` con un pago `CASH_PENDING`; nunca se marca como pagado   |
| Idempotencia           | `Idempotency-Key` obligatoria en `POST /orders`, respaldada por `IdempotencyRecord` (el registro actúa como cerrojo; ver `utils/idempotency.ts`). La web usa la misma clave al reintentar el mismo pedido y una nueva si cambia algo                      |
| Instantáneas           | El pedido copia nombre y precio de los productos, opciones, datos del cliente y dirección: cambiar la carta o la dirección guardada después no altera pedidos anteriores                                                                                  |
| Datos en la web        | La carta, los favoritos y las promociones salen de la API (Suspense + aviso si no responde). El resto de datos del local (pie, horarios de portada, FORNEA CLUB) siguen siendo de demostración hasta el panel de administración (fase 8)                   |
| Pruebas E2E            | Arrancan la API real contra `forno_test` sembrada (`tests/e2e/global-setup.ts`). El checkout con sesión no se automatiza (necesitaría una sesión real de Supabase): lo cubren las pruebas de API y las unitarias con servidor simulado                    |

## Pendiente

- Cancelación de pedidos por el cliente y reversión de puntos (fase 7/8).
- Factura, ticket y correos de pedido: hechos en la fase 9 (ver 0012).
- Probar el checkout con una sesión real de Supabase (manual).
