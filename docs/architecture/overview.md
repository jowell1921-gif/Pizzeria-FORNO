# Arquitectura general

## Componentes

- **Frontend (Next.js, Vercel):** presentación. No contiene lógica de negocio ni cálculo de importes.
- **Backend (Express, Railway):** única fuente de verdad. Precios, IVA, promociones, puntos, estados de pedido, pagos, facturas, correos, asistente y autorización por rol.
- **Supabase:** Auth (identidad compartida web y Flutter), PostgreSQL alojado y Storage de imágenes.
- **Stripe:** pagos online (Checkout), confirmados únicamente mediante webhooks con firma verificada.
- **Resend (opcional):** envío de los correos de pedido.
- **Proveedor de IA (opcional, Claude):** respuestas de PizzAI, siempre a través del backend.

```
Navegador (Next.js) ──┐
                      ├── HTTPS + Bearer JWT ──► Express /api/v1 ──► Prisma ──► PostgreSQL
Flutter (futuro) ─────┘          │                     │
       └──► Supabase Auth        │                     ├──► Stripe (Checkout + webhooks)
                                 │                     ├──► Supabase Storage (fotos)
                                 │                     ├──► Resend (correos)
                                 │                     └──► Proveedor de IA (PizzAI)
                                 └── SSE: cocina y panel en directo
```

## Principios

- El cliente envía identificadores y cantidades; el servidor recalcula todo importe.
- El rol del usuario se lee de la base de datos del backend, nunca del token ni de datos enviados por el cliente.
- Importes en JSON como cadenas decimales (`"12.50"`); fechas en ISO 8601 UTC.
- El navegador no accede a tablas de negocio de Supabase. RLS activo (sin políticas) como defensa en profundidad.
- Tiempo real de cocina mediante SSE desde Express (decisión 0009).
- Procesos periódicos en el propio proceso de la API (una réplica): reintento de correos y mantenimiento (cancelar pedidos online abandonados a los 45 minutos y purgar claves de idempotencia caducadas). Ver `modules/orders/maintenance.service.ts` y la auditoría (`docs/quality/auditoria.md`).
- Un solo contrato (OpenAPI) para la web y la app: `docs/api/openapi.json`.

## Capas del backend

`routes → service → Prisma` (los repositorios solo donde aportan). Cada módulo está en `backend/src/modules/`:

| Módulo                                       | Responsabilidad                                                              |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `catalog`, `promotions`, `store`, `delivery` | Datos públicos de la carta, promociones, local y zonas                       |
| `checkout`, `cart`, `orders`                 | Presupuesto, carrito, creación de pedidos y máquina de estados               |
| `loyalty`                                    | FORNEA CLUB: libro de movimientos, canjes y reglas de puntos                 |
| `payments`                                   | Stripe Checkout, webhooks, reembolsos                                        |
| `notifications`, `documents`                 | Correos de pedido (cola con reintentos), tickets y facturas en PDF           |
| `kitchen`, `admin`                           | Pantalla de cocina y panel del personal, con permisos explícitos y auditoría |
| `assistant`                                  | PizzAI con IA: datos públicos, límites y proveedor intercambiable            |
| `me`, `addresses`                            | Perfil y direcciones del usuario                                             |

Las reglas de negocio puras (precio, IVA, puntos, transiciones de estado) son funciones sin dependencias,
probadas de forma aislada. Reglas descritas para clientes: `docs/flutter/reglas-de-negocio.md`.

## Frontend

Next.js (App Router) con Server Components por defecto y componentes de cliente solo donde hay
interacción. Zonas: web pública, `/cuenta`, `/pedido`, y el área privada `(panel)` (`/admin`, `/kitchen`).
Estado remoto con TanStack Query, carrito con Zustand persistente y formularios con React Hook Form + Zod.

## Documentos relacionados

- Base de datos: `docs/database/README.md` y el diagrama generado `docs/database/diagrama.md`.
- API: `docs/api/README.md` y `docs/api/openapi.json`.
- Integración móvil: `docs/flutter/`.
- Seguridad: `docs/security/`. Despliegue: `docs/deployment/`. Calidad: `docs/quality/`. Decisiones: `docs/decisions/`.
