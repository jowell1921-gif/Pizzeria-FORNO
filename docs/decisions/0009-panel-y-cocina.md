# 0009 — Panel del personal y pantalla de cocina (Fase 8A)

Fecha: 2026-11-08

La fase 8 se divide en dos entregas. Esta es la **8A**: pedidos del personal, pantalla de cocina y panel de control. La **8B** (productos, promociones, FORNEA CLUB y configuración del local) llega después.

| Tema                  | Decisión                                                                                                                                                                                                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Permisos              | Cada ruta exige un permiso explícito (no el nombre del rol): `orders:read:all`, `orders:update-status`, `dashboard:read`, `kitchen:orders:read`, `kitchen:orders:update-status`. Los permisos salen de la base de datos; cualquier rol que envíe el cliente se ignora. Los pagos solo se muestran con `payments:read` |
| Cambios de estado     | Una única vía: `changeOrderStatus` (ver 0008). Las rutas del personal y de cocina solo la llaman. Cada cambio del personal queda en `OrderStatusHistory` y en `AuditLog`                                                                                                                                              |
| Cocina: datos mínimos | Ve qué preparar y para cuándo (productos, opciones, notas, hora, modalidad). **No** recibe nombre, teléfono, correo, dirección, importes ni pagos: la vista se construye con una lista explícita de campos y una prueba comprueba que no hay datos personales en la respuesta                                         |
| Cocina: acciones      | Aceptar, preparar, marcar listo y entregar (solo recogida), sin saltarse pasos. Rechazar, cancelar, devolver y sacar a reparto son del personal. Los pedidos a domicilio listos esperan al repartidor                                                                                                                 |
| Tiempo real           | **SSE** desde Express (`/kitchen/stream` y `/admin/stream`), tal como decidió el propietario: las tablas de negocio no son accesibles desde clientes Supabase, así que Supabase Realtime no encaja. Se consume con `fetch` (cabecera `Authorization`), nunca con el token en la URL                                   |
| Qué viaja por SSE     | Solo `{ kind, orderId, orderNumber, status }`. Latido cada 25 s; el flujo se cierra a los 15 min y el cliente reconecta con token renovado, de modo que una sesión revocada deja de recibir avisos                                                                                                                    |
| Respaldo              | Si el flujo se corta, la pantalla sigue con consulta periódica (20 s en cocina, 60 s en el panel) y reintenta con espera creciente (2–30 s)                                                                                                                                                                           |
| Una sola instancia    | El bus de eventos está en memoria. Con varias réplicas de la API habría que usar un canal compartido (Redis o LISTEN/NOTIFY de PostgreSQL)                                                                                                                                                                            |
| Panel de control      | Pedidos de hoy por estado (en la zona horaria del local), ventas completadas y en curso, ticket medio, productos más pedidos de 7 días y últimos pedidos                                                                                                                                                              |
| Interfaz              | Zona `(panel)` independiente de la web pública (cabecera y rutas propias): `/admin`, `/admin/pedidos`, `/admin/pedidos/[id]` y `/kitchen`. La interfaz solo oculta lo que el rol no puede usar; la seguridad real está en el backend                                                                                  |

## Pendiente (8B)

- Productos, categorías, opciones y extras, alérgenos y fotos (Supabase Storage).
- Promociones y cupones (incluidas las automáticas), recompensas y ajustes de puntos desde el panel.
- Configuración del local: datos, horarios, festivos, zonas, mínimos, pausa de pedidos y métodos de pago.
- Prueba de punta a punta del panel con una sesión real de Supabase (manual).
