# Arquitectura general

## Componentes

- **Frontend (Next.js, Vercel):** presentación. No contiene lógica de negocio ni cálculo de importes.
- **Backend (Express, Railway):** única fuente de verdad. Precios, IVA, promociones, puntos, estados de pedido, pagos, facturas y autorización por rol.
- **Supabase:** Auth (identidad compartida web y Flutter), PostgreSQL alojado y Storage de imágenes.
- **Stripe:** pagos online, confirmados únicamente mediante webhooks con firma verificada.

```
Navegador (Next.js) ──┐
                      ├── HTTPS + Bearer JWT ──► Express /api/v1 ──► Prisma ──► PostgreSQL
Flutter (futuro) ─────┘                              │
       └──► Supabase Auth                            ├──► Stripe (webhooks)
                                                     └──► Supabase Storage
```

## Principios

- El cliente envía identificadores y cantidades; el servidor recalcula todo importe.
- El rol del usuario se lee de la base de datos del backend, nunca del token ni de datos enviados por el cliente.
- Importes en JSON como cadenas decimales (`"12.50"`); fechas en ISO 8601 UTC.
- El navegador no accede a tablas de negocio de Supabase. RLS activo como defensa en profundidad.
- Tiempo real de cocina mediante SSE desde Express.

## Capas del backend

`routes → controller → service → (repository solo si aporta) → Prisma`

Las reglas de negocio puras (precio, IVA, puntos, transiciones de estado) viven en funciones sin dependencias para poder probarlas de forma aislada.
