# Criterios de aceptación final (sección 26)

Estado a 2026-11-12. Cada criterio con su evidencia. «Verificado» significa ejecutado y comprobado;
lo que depende de servicios reales que solo puede activar el propietario se indica aparte.

| Criterio                                 | Estado                        | Evidencia                                                                                                                                                                    |
| ---------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La web pública funciona correctamente    | Verificado                    | 351 pruebas de navegador (móvil, tablet y escritorio), accesibilidad WCAG 2.2 AA con axe, Lighthouse 96-100 en accesibilidad y buenas prácticas                              |
| La carta es dinámica                     | Verificado                    | Carta, categorías, opciones, alérgenos y fotos salen de PostgreSQL por la API; editable desde el panel                                                                       |
| El carrito y el checkout funcionan       | Verificado                    | Pruebas de componentes y de navegador; presupuesto calculado siempre por el servidor                                                                                         |
| Pedidos para recogida y domicilio        | Verificado                    | Pruebas de API (casos críticos 9 y 10) y de navegador                                                                                                                        |
| Horarios, zonas y pedidos mínimos        | Verificado                    | Franjas calculadas en el servidor; zona y mínimo validados al crear el pedido                                                                                                |
| Pago con los métodos aprobados           | Verificado                    | Efectivo y tarjeta (Stripe Checkout). La tarjeta se probó de punta a punta en **modo prueba** con su webhook; el pago real exige activar la cuenta de Stripe                 |
| Autenticación con Google y correo        | Verificado por el propietario | Registro, confirmación y Google OAuth comprobados con un proyecto real de Supabase. El correo de confirmación a cualquier dirección exige SMTP propio con dominio verificado |
| Los usuarios consultan sus pedidos       | Verificado                    | «Mi cuenta» y `GET /orders/me`; un cliente nunca ve pedidos ajenos (caso crítico 1)                                                                                          |
| FORNO CLUB funciona correctamente        | Verificado                    | Puntos al completar (una sola vez), reversión al cancelar, canjes atómicos y libro inmutable (casos 4, 5, 6 y 8)                                                             |
| Las promociones se validan en el backend | Verificado                    | Cupones, automáticas, combos y recompensas validados con bloqueo, también con peticiones simultáneas                                                                         |
| El panel administrativo funciona         | Verificado                    | Carta, promociones, FORNO CLUB, local, correos y auditoría; 72 pruebas de navegador con sesión en 4 tamaños de pantalla                                                      |
| La pantalla de cocina funciona           | Verificado                    | Columnas por estado, acciones rápidas y tiempo real (SSE); sin datos personales ni importes                                                                                  |
| Los permisos están protegidos            | Verificado                    | Auditoría automática de toda la API: 401 sin sesión, 403 a clientes en todo `/admin` y `/kitchen`, sin acceso a datos ajenos                                                 |
| Las operaciones económicas son seguras   | Verificado                    | Importes en `Decimal`, transacciones, idempotencia, pago solo por evento firmado, reembolsos auditados, facturas inmutables                                                  |
| Las pruebas críticas están superadas     | Verificado                    | Los 10 casos de la sección 16 (`docs/quality/casos-criticos.md`)                                                                                                             |
| La API está documentada                  | Verificado                    | OpenAPI 3.1 (`docs/api/openapi.json`, siempre sincronizado con el código), Swagger UI en desarrollo, catálogo de errores                                                     |
| El sistema está preparado para Flutter   | Verificado                    | Un cliente independiente recorre el viaje de la app usando solo el contrato; guía de integración, ejemplos reales y reglas de negocio en `docs/flutter/`                     |
| La documentación está actualizada        | Verificado                    | README, arquitectura, diagrama de la base de datos (generado del esquema), contratos, autenticación, despliegue, decisiones y registro de cambios                            |

## Pruebas y calidad (resumen)

Backend: 58 unitarias y 419 de base de datos y API (incluidos los casos críticos, la auditoría de
seguridad y el cliente independiente) · Frontend: 443 unitarias, 351 de navegador de la web pública y 72
del panel con sesión · Cobertura: backend 96 % de líneas, frontend 75 % · `npm audit` de producción: 0
vulnerabilidades · Instalación desde un clon limpio y migraciones sobre una base vacía: superadas.
Detalle en [`informe-qa.md`](./informe-qa.md).

## Lo que no está hecho (y por qué)

Ningún punto crítico de la sección 26 queda abierto. Lo siguiente depende de decisiones, cuentas o
gastos del propietario, y está documentado:

| Pendiente                                            | Qué hace falta                                                                                                                    | Dónde está explicado                                |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Publicar en Vercel, Railway y Supabase de producción | Cuentas y variables del propietario; **no se ha publicado nada**                                                                  | `docs/deployment/`                                  |
| Cobrar con tarjeta de verdad                         | Activar la cuenta de Stripe y poner claves reales                                                                                 | `docs/deployment/servicios-externos.md`             |
| Correos reales a los clientes                        | Dominio propio verificado en Resend                                                                                               | `docs/decisions/0012-pagos-correos-y-documentos.md` |
| PizzAI con IA real                                   | Clave de API (con coste) del proveedor; no se ha probado contra el servicio real                                                  | `docs/decisions/0013-pizzai-ia.md`                  |
| Textos legales definitivos                           | Datos del titular y revisión profesional                                                                                          | `docs/security/lista-produccion.md`                 |
| Facturas rectificativas                              | Un pedido reembolsado conserva su ticket original                                                                                 | `docs/decisions/0012-pagos-correos-y-documentos.md` |
| Varias réplicas de la API                            | Mover el bus de eventos y el tope diario de PizzAI a Redis o a la base de datos                                                   | `docs/decisions/0009-panel-y-cocina.md`             |
| La aplicación Flutter                                | Fuera del alcance de este proyecto; la API y la documentación están listas                                                        | `docs/flutter/`                                     |
| `SELF_ADMIN_ENABLED`                                 | Es una opción de **demostración**: con `true`, cualquier cliente puede hacerse administrador. Ponla en `false` en un negocio real | `docs/decisions/0010-administracion-del-negocio.md` |
