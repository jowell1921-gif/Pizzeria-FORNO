# 0001 — Decisiones iniciales

Fecha: 2026-11-05

| Tema                                                                       | Decisión                                                                                       |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Estructura                                                                 | Dos proyectos independientes (`frontend/`, `backend/`), cada uno con su lockfile. Sin monorepo |
| Compra                                                                     | Solo usuarios registrados; no hay compra como invitado                                         |
| Carrito                                                                    | Persistencia local y sincronización con el servidor para usuarios autenticados                 |
| Tiempo real                                                                | SSE desde Express (Supabase Realtime exigiría exponer tablas de negocio al cliente)            |
| Entornos                                                                   | PostgreSQL local en Docker para desarrollo y pruebas                                           |
| Pagos                                                                      | Stripe; sin activarlo hasta disponer de credenciales                                           |
| Impuestos                                                                  | Precios con IVA incluido; factura y ticket por pedido                                          |
| Idioma                                                                     | Interfaz, textos legales y documentación en español; código en inglés                          |
| Datos comerciales                                                          | Datos de demostración permitidos, identificados como tales                                     |
| Módulos ES                                                                 | El backend usa ESM (`"type": "module"`, `NodeNext`)                                            |
| Prisma, Zod en formularios, TanStack Query, Zustand, shadcn/ui, Playwright | Se incorporan en la fase que los necesita, no antes                                            |

## Riesgos conocidos

- `npm audit` del frontend informa de vulnerabilidades moderadas y bajas únicamente en dependencias de desarrollo (`minimatch` a través de `eslint-config-next`, y herramientas de la CLI de shadcn). `npm audit --omit=dev` no informa de ninguna. La corrección automática propuesta degrada `eslint-config-next`, por lo que se revisará cuando exista una versión corregida.
