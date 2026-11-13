# Auditoría técnica integral

Fecha: 13 de noviembre de 2026. Alcance: backend, frontend, base de datos, API, pruebas, dependencias,
configuración y documentación. Método: lectura del código de las zonas críticas, análisis estático
(`tsc`, ESLint, `npm audit`, ciclos de importación, importaciones sin uso) y ejecución de todas las
pruebas. No se probó nada contra servicios reales (Stripe, Supabase, Resend, Gemini en producción).

## Estado general

El proyecto está en buen estado: **no se encontraron problemas críticos (P0)**. La arquitectura es
coherente, los importes, descuentos y puntos se calculan y validan solo en el servidor, y las zonas
sensibles (pagos, sesión, permisos) están bien resueltas. Los hallazgos importantes eran de robustez
operativa, no de seguridad explotable. Se corrigieron todos los que se podían corregir sin decisiones de
negocio ni cambios incompatibles; lo que queda está en «Pendiente» y «Aceptado».

| Prioridad | Hallazgos | Corregidos | Aceptados / pendientes     |
| --------- | --------- | ---------- | -------------------------- |
| P0        | 0         | —          | —                          |
| P1        | 2         | 1          | 1 (acción del propietario) |
| P2        | 11        | 8          | 3                          |
| P3        | 7         | 3          | 4                          |

## Arquitectura

- **Separación**: `frontend/` (Next.js) y `backend/` (Express) son proyectos independientes que solo se
  comunican por la API REST versionada. La base de datos solo la toca el backend (Prisma). Correcto.
- **Módulos del backend** por dominio (`modules/orders`, `payments`, `loyalty`, `admin`…), con rutas
  finas, servicios con la lógica y utilidades compartidas (`utils/`, `middleware/`, `auth/`).
- **Acoplamiento**: 0 ciclos de importación en backend y en frontend (comprobado con un análisis del
  grafo de importaciones) y 0 archivos sin importar.
- **Duplicación**: no se detectó duplicación relevante. Los esquemas de validación están una sola vez
  (Zod) y alimentan también el contrato OpenAPI.
- **Patrones**: capas de servicio sin repositorios (Prisma ya cumple ese papel), pasarela de pago y
  modelo de IA detrás de interfaces (`PaymentGateway`, `AssistantModel`). No hay abstracciones de más.
- **Veredicto**: la arquitectura es adecuada y permite crecer sin reconstruir (ver «Escalabilidad»).

## Hallazgos y correcciones

### P1 — importantes

| #   | Hallazgo                                                                                                                                                                                                                                                                                                       | Dónde                                                                   | Estado                                                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Pedidos online abandonados nunca caducaban.** Un pedido con pago con tarjeta se crea «pendiente de pago»; si el cliente cerraba la web antes de abrir Stripe, no llegaba ningún evento y el pedido (con su cupón, recompensa y puntos reservados) quedaba bloqueado para siempre.                            | `modules/payments/payment.service.ts` (no había tarea que lo cancelara) | **Corregido**: `modules/orders/maintenance.service.ts` cancela, cada 5 minutos, los pedidos online sin pago iniciado en 45 min y libera lo reservado. Con pruebas.                                  |
| 2   | **El propietario se identifica por su correo.** `OWNER_EMAIL` decide quién modifica carta, promociones, club y local, y el correo viene del token de Supabase. Es seguro solo si Supabase exige **confirmar el correo** al registrarse (si no, alguien podría registrarse con un correo ajeno aún sin cuenta). | `auth/permissions.ts` (`canEditContent`), `auth/authenticate.ts`        | **Pendiente de tu parte**: comprobar en Supabase → Authentication → Providers → Email que «Confirm email» está activado (está en la lista de producción). El arranque avisa si falta `OWNER_EMAIL`. |

### P2 — mejoras recomendables

| #   | Hallazgo                                                                                                                                 | Dónde                                                          | Estado                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3   | **N+1 en el listado de promociones**: una consulta por promoción y otra por cupón para contar usos.                                      | `modules/admin/promotions-admin.service.ts` (`view`)           | **Corregido**: dos consultas agrupadas para todas las filas.                                                                                                                          |
| 4   | Respuestas con datos de una persona (perfil, pedidos…) sin `Cache-Control: no-store`.                                                    | `auth/authenticate.ts`                                         | **Corregido**: toda respuesta autenticada lleva `private, no-store`.                                                                                                                  |
| 5   | Los procesos en segundo plano (avisos por correo) se tragaban los errores sin registrarlos.                                              | `modules/notifications/notification.service.ts`                | **Corregido**: se registra el mensaje (nunca el contenido).                                                                                                                           |
| 6   | La subida de fotos a Supabase Storage no tenía plazo: una caída dejaba la petición colgada y acababa en 500.                             | `modules/admin/storage.ts`                                     | **Corregido**: plazo de 15 s y `502 STORAGE_ERROR`.                                                                                                                                   |
| 7   | El pool de conexiones no tenía plazo ni tamaño explícito: sin conexión libre, la petición esperaba indefinidamente.                      | `db/client.ts`                                                 | **Corregido**: plazo de 10 s y tamaño configurable (`DATABASE_POOL_MAX`, 10 por defecto).                                                                                             |
| 8   | Las claves de idempotencia caducadas no se borraban nunca (la tabla crecía sin límite).                                                  | `utils/idempotency.ts`                                         | **Corregido**: se purgan en el mantenimiento periódico.                                                                                                                               |
| 9   | Un cobro con importe distinto al del pedido se marcaba como fallido sin dejar aviso.                                                     | `modules/payments/payment.service.ts` (`settlePayment`)        | **Corregido (parcial)**: queda un aviso en el registro. Falta decidir si debe avisar al personal o reembolsar solo (decisión de negocio; no puede ocurrir sin manipular la pasarela). |
| 10  | **Documentación en el código**: 45 funciones exportadas de servicios y 41 páginas y componentes sin comentario.                          | varios                                                         | **Corregido**: JSDoc/comentarios en español con el propósito y las reglas de negocio.                                                                                                 |
| 11  | La llamada a Stripe para crear la sesión de pago ocurre dentro de una transacción con cerrojo (hasta 30 s reteniendo una conexión).      | `modules/payments/payment.service.ts` (`createPaymentSession`) | **Aceptado**: el cerrojo evita crear dos sesiones y el plazo está acotado. Con mucho tráfico habría que sacar la llamada de la transacción.                                           |
| 12  | **RGPD**: no hay autoservicio para borrar la cuenta ni exportar los datos; hoy se atienden a mano (como dice la política de privacidad). | —                                                              | **Pendiente**: es una funcionalidad nueva (hay que decidir qué se conserva por obligación legal: facturas).                                                                           |
| 13  | Sin `Content-Security-Policy` en la web (exige nonces para los scripts de Next.js).                                                      | `frontend/next.config.ts`                                      | **Aceptado/pendiente**: ya documentado en `docs/security/lista-produccion.md`; el resto de cabeceras de seguridad sí está.                                                            |

### P3 — opcionales

| #   | Hallazgo                                                                                                                       | Estado                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 14  | `robots.txt` no excluía las zonas con sesión (`/cuenta`, `/pedido`, `/auth`).                                                  | **Corregido**                                                                                             |
| 15  | Import de React sin uso (`components/ui/dialog.tsx`).                                                                          | **Corregido**                                                                                             |
| 16  | `prettier` reformateaba archivos generados (`openapi.json`, ejemplos, diagrama) y rompía la prueba de sincronización.          | **Corregido** (`.prettierignore`)                                                                         |
| 17  | El logo de origen pesa 358 KB.                                                                                                 | **Aceptado**: `next/image` lo sirve ya redimensionado y optimizado; se podría reducir el original.        |
| 18  | El frontend no activa `noUncheckedIndexedAccess` (el backend sí).                                                              | **Pendiente**: el cambio toca muchos archivos; mejora la seguridad de tipos.                              |
| 19  | 10 (backend) y 13 (frontend) avisos de `npm audit` de gravedad moderada, solo en herramientas de desarrollo (ESLint, pruebas). | **Aceptado**: `npm audit fix --force` cambiaría versiones mayores. En producción: **0 vulnerabilidades**. |
| 20  | `GET /admin/products` no pagina.                                                                                               | **Aceptado**: la carta es pequeña; se paginaría si creciera.                                              |

## Seguridad: lo comprobado

| Área                       | Resultado                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autenticación              | El token de Supabase se verifica en el servidor con la clave pública (JWKS): firma ES256/RS256, emisor, audiencia, caducidad y rechazo de usuarios anónimos. Identidad, roles y permisos nunca salen del cliente.                                                                                                                                                                                    |
| Autorización               | Permisos explícitos por endpoint; los de lectura y escritura del panel están separados (`…:read` / `…:manage`). Una prueba automática recorre **todas** las operaciones de la API y comprueba 401 sin sesión y 403 a un cliente.                                                                                                                                                                     |
| Entradas                   | Zod estricto en cada endpoint (los campos de precio o total del cliente se rechazan). Cuerpos limitados: 100 KB (JSON), 1 MB (webhook) y 3 MB (imagen, comprobada por sus bytes).                                                                                                                                                                                                                    |
| SQL                        | Todo pasa por Prisma. Solo hay 5 consultas en bruto, con plantilla etiquetada (parámetros, no concatenación).                                                                                                                                                                                                                                                                                        |
| XSS                        | Un único `dangerouslySetInnerHTML` (datos estructurados), con contenido constante y `<` escapado. React escapa el resto.                                                                                                                                                                                                                                                                             |
| CSRF                       | La API usa el token en la cabecera `Authorization` (no cookies), así que no es vulnerable a CSRF. Las rutas de Next que usan cookies solo hacen `GET` para canjear códigos de Supabase y redirigen a rutas internas (`safeNextPath`, sin redirección abierta).                                                                                                                                       |
| CORS / cabeceras / límites | CORS por lista de orígenes, `helmet` en la API, HSTS, `X-Frame-Options`, `nosniff` y `Permissions-Policy` en la web. Límite de peticiones por IP, por usuario y para escrituras.                                                                                                                                                                                                                     |
| Secretos                   | Ninguno en el repositorio (análisis de patrones de claves). `.env` ignorado; la clave `service_role` y las de Stripe solo en el servidor. Los registros no incluyen cabeceras ni cuerpos.                                                                                                                                                                                                            |
| Stripe                     | Firma del webhook verificada sobre el cuerpo en bruto; evento único (índice por proveedor e id) y procesamiento idempotente; importe y moneda comprobados contra el pedido; un pedido solo pasa a pagado con un evento auténtico; pago tardío de un pedido cancelado, devuelto automáticamente; reembolsos con clave de idempotencia y auditoría. El navegador no puede alterar importes ni estados. |
| Base de datos              | Dinero en `Decimal`, restricciones `CHECK` e índices únicos, transacciones con cerrojo en pedidos, puntos y pagos, libro de puntos y facturas inmutables, instantáneas en los pedidos.                                                                                                                                                                                                               |
| RGPD / LOPDGDD (técnico)   | Minimización (PizzAI no recibe datos de clientes), solo cookies técnicas, registro de operaciones administrativas, textos informativos redactados. **No se afirma cumplimiento legal**: faltan los datos del titular y la revisión de un profesional (ver pendiente 12).                                                                                                                             |

## Rendimiento y escalabilidad

- **Consultas**: índices adecuados para los accesos habituales (`Order(userId, createdAt)`, `Order(status, createdAt)`, claves únicas de pagos y eventos, etc.). Se eliminó el único N+1 detectado.
- **Frontend**: 61 de 114 archivos `.tsx` son componentes de cliente (el resto, de servidor); imágenes con `next/image` y formatos modernos; el mayor fragmento de JavaScript pesa unos 256 KB (sin comprimir). Lighthouse (fase 10) con 96-100 en accesibilidad y buenas prácticas.
- **Caché**: datos públicos con `max-age` corto y `stale-while-revalidate`; datos privados sin caché.
- **Una sola réplica**: el límite de peticiones, el bus de eventos de la cocina (SSE), el tope diario de PizzAI y el mantenimiento periódico viven en memoria del proceso. Es lo adecuado ahora (Railway con una instancia); para varias réplicas habría que moverlos a Redis o a la base de datos (documentado en la decisión 0009).

### ¿Permite la arquitectura crecer?

| Ampliación                     | Veredicto                                                                                                                                                                                                                                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App móvil Flutter              | **Lista**: contrato OpenAPI, cliente de pruebas independiente y guía (`docs/flutter/`).                                                                                                                                                                                                                                       |
| Nuevos métodos de pago         | **Fácil**: basta otra implementación de `PaymentGateway`.                                                                                                                                                                                                                                                                     |
| Otros sistemas de fidelización | **Razonable**: el libro de movimientos y las reglas están aislados en `modules/loyalty`.                                                                                                                                                                                                                                      |
| Más paneles o roles            | **Fácil**: permisos explícitos y roles en base de datos.                                                                                                                                                                                                                                                                      |
| Agentes de IA                  | **Fácil**: `AssistantModel` ya admite dos proveedores.                                                                                                                                                                                                                                                                        |
| Varios establecimientos        | **Requiere trabajo moderado**: hoy hay un único local (`StoreSettings` con `id = 1`) y los horarios, zonas y pedidos no llevan identificador de local. Habría que añadir una entidad `Store` y una migración; los pedidos antiguos no se verían afectados porque guardan una copia de sus datos. No hace falta hacerlo ahora. |

## Pruebas

Ver resultados de la última ejecución en [`informe-qa.md`](./informe-qa.md) y en el cierre de la
auditoría (CHANGELOG). Cobertura funcional crítica: autenticación, permisos, pedidos, pagos y
webhooks, puntos y canjes (incluida la concurrencia), documentos, panel y cocina con sesión en cuatro
tamaños de pantalla, y accesibilidad con axe.

Huecos conocidos (no son fallos, sino cosas que no se prueban automáticamente):

- Los servicios externos reales (Supabase, Stripe, Resend, Gemini): se prueban con dobles; la primera prueba real es manual.
- No hay pruebas de carga de la cocina en directo con muchos clientes conectados.
- El autoservicio de borrado y exportación de datos no existe (pendiente 12).

## Documentación

README, arquitectura, base de datos (con diagrama generado), API (OpenAPI), autenticación y seguridad,
despliegue, calidad, decisiones técnicas y guía para Flutter están actualizados y en español. Se añadió
este informe y se documentaron `OWNER_EMAIL`, `DATABASE_POOL_MAX` y el mantenimiento periódico.

## Plan para lo que queda

1. **Antes de publicar** (tuyo): activar «Confirm email» en Supabase, poner `OWNER_EMAIL` y definir los datos del titular (`frontend/src/lib/legal.ts`).
2. **Cuando haya clientes reales**: autoservicio de borrado y exportación de datos; `Content-Security-Policy` con nonces.
3. **Si crece el tráfico**: sacar la llamada a Stripe de la transacción; mover límites, SSE y mantenimiento a Redis o a un trabajo programado.
4. **Calidad de tipos**: activar `noUncheckedIndexedAccess` en el frontend.
