# Casos críticos (sección 16): matriz de pruebas

Cada caso tiene una prueba de aceptación de punta a punta por la API real y PostgreSQL
(`backend/tests/api/critical-cases.test.ts`, caso por caso) y pruebas más finas en el resto de
archivos. Se ejecutan con `npm run test:db` en `backend/`.

| #   | Caso crítico                                               | Prueba de aceptación                                                 | Pruebas complementarias                                                                                                                                                                                                                                                  |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Un cliente no puede consultar pedidos de otro              | `critical-cases` · «1.»                                              | `orders.test.ts` (listado, 404 en vez de 403, identificadores malformados); `security-audit.test.ts` (IDOR en direcciones, pedidos, documentos, pagos y facturas)                                                                                                        |
| 2   | Un usuario no puede acceder al panel sin autorización      | `critical-cases` · «2.»                                              | `auth.test.ts` (rutas con privilegios); `security-audit.test.ts` (401 sin sesión y 403 a un cliente en **todas** las operaciones de `/admin` y `/kitchen`; cocina y personal limitados; roles, permisos e identidad enviados por el cliente se ignoran); `roles.test.ts` |
| 3   | No se puede manipular el precio desde el frontend          | `critical-cases` · «3.»                                              | `checkout.test.ts` («never accepts prices or totals sent by the client»); esquemas estrictos en toda la API                                                                                                                                                              |
| 4   | No se conceden puntos dos veces por el mismo pedido        | `critical-cases` · «4.»                                              | `tests/db/loyalty.test.ts` (caso 4, índice único), `tests/db/loyalty-flow.test.ts`                                                                                                                                                                                       |
| 5   | No se canjean puntos sin saldo suficiente                  | `critical-cases` · «5.»                                              | `tests/db/loyalty.test.ts` (caso 5, restricción de saldo no negativo)                                                                                                                                                                                                    |
| 6   | Dos solicitudes simultáneas no consumen los mismos puntos  | `critical-cases` · «6.» (6 peticiones a la vez: exactamente 1 canje) | `tests/db/loyalty.test.ts` (caso 6), `promotions-loyalty.test.ts`                                                                                                                                                                                                        |
| 7   | Un pago fallido no puede generar un pedido pagado          | `critical-cases` · «7.»                                              | `payments.test.ts` (firma falsa, importe distinto, evento duplicado o simultáneo, pago tardío)                                                                                                                                                                           |
| 8   | Un pedido cancelado revierte los puntos ya concedidos      | `critical-cases` · «8.»                                              | `tests/db/loyalty-flow.test.ts` (reversión hasta el saldo disponible, devolución íntegra de recompensas)                                                                                                                                                                 |
| 9   | Una zona de reparto no válida impide el pedido a domicilio | `critical-cases` · «9.»                                              | `checkout.test.ts` («rejects deliveries outside the zones…»)                                                                                                                                                                                                             |
| 10  | Un pedido inferior al mínimo se rechaza                    | `critical-cases` · «10.»                                             | `checkout.test.ts`; `store-admin.test.ts` (zonas y mínimos)                                                                                                                                                                                                              |

## Otras garantías comprobadas automáticamente

- **Superficie de la API** (`security-audit.test.ts`): solo hay operaciones públicas en una lista
  explícita; añadir una nueva obliga a cambiar la prueba.
- **Entradas maliciosas**: todas las operaciones protegidas, con un administrador y 9 cargas
  distintas (inyección SQL, `__proto__`, HTML, textos enormes, tipos erróneos…), no producen ningún
  error 500 ni filtran rutas, trazas o SQL.
- **Cabeceras y CORS**: `nosniff`, HSTS, sin `X-Powered-By`, solo el origen autorizado y límite de
  tamaño del cuerpo (413).
- **Secretos**: ninguna respuesta pública contiene claves; ningún secreto en los archivos ni en el
  historial de Git.
- **Dinero y puntos en la base de datos**: restricciones de integridad, libro de movimientos que no
  se puede modificar y saldo que nunca es negativo (`tests/db/`).
