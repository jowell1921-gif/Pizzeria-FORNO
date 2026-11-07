# Registro de cambios

## [Sin publicar]

### Fase 3 — Base de datos

- Esquema Prisma 7 con 39 tablas (usuarios, catálogo, carrito, tienda, promociones, pedidos, pagos, facturas, fidelización y transversales) y 3 migraciones versionadas.
- Reglas de integridad en la propia base: saldo de puntos solo mediante el libro (con bloqueo de fila), tablas de solo-añadir, restricciones de importes y totales de pedido, índices únicos parciales, solapes de horarios y RLS por defecto.
- Cliente de base de datos (`src/db/client.ts`) y datos de demostración idempotentes (`npm run db:seed`).
- 95 pruebas de integridad contra PostgreSQL (`npm run test:db`), incluida la concurrencia de canjes y de numeración de facturas.
- IVA 2026 según la Agencia Tributaria: 10 % comida preparada y agua; 21 % alcohol y bebidas refrescantes con azúcares añadidos (corrige el refresco de cola y la limonada, que estaban al 10 %). Ver `docs/decisions/0004-iva.md`.
- Política de puntos sin saldos negativos: los puntos gastados en un pedido cancelado se devuelven completos; los ganados se revierten hasta el saldo disponible.

### Fase 2 — Diseño e interfaz

- Sistema de diseño FORNO: paleta con variantes accesibles, Barlow Condensed e Inter, componentes shadcn/ui y Lucide.
- Páginas públicas con datos de demostración: inicio, carta, promociones, FORNO CLUB, páginas legales (marcadores) y 404.
- Cabecera con menú móvil, pie de página, enlace «Saltar al contenido» y aviso de sitio de demostración.
- SEO básico: metadatos por página, `sitemap.xml`, `robots.txt` y datos estructurados `Restaurant`.
- Pruebas: Vitest (83) y Playwright con axe en 4 resoluciones.
- Imágenes provisionales: logotipo, hero, carta y fichas de producto (WebP optimizado, mapa único en `src/lib/images.ts`).
- Animaciones: pizza del hero con entrada y flotación suave, imágenes que se «dibujan» al hacer scroll y tarjetas con aparición progresiva (CSS puro, respetan «reducir movimiento»).
- Contadores por tiempo (4 s) que arrancan al entrar en pantalla; foto de la carta que crece y «respira»; marca de agua «FORNO» en Promociones; fondo animado (hojas y brasas) en FORNO CLUB; enlace «Principal» en la navegación.
- Fondo animado del hero (hojas de albahaca que caen y chispas de brasa que suben); la pizza ya no se agranda al hacer scroll; las fotos de producto son estáticas.
- Hero con profundidad al hacer scroll (marca de agua, halo, pizza y texto a distinta velocidad), franja de cifras con contadores animados y tarjetas interactivas.
- Transiciones entre páginas con `<ViewTransition>`: deslizamiento direccional con desenfoque y cabecera anclada.
- Corrección: eliminado el BOM de `frontend/.env.example`, `frontend/.gitignore` y `frontend/vitest.config.mts`.
- `typecheck` ejecuta `next typegen` antes de `tsc` para funcionar desde un clon limpio.

### Fase 1 — Configuración

- Proyecto frontend (Next.js, TypeScript strict, Tailwind, ESLint, Prettier, Vitest).
- Proyecto backend (Express, TypeScript strict, ESM, Helmet, CORS, Zod, ESLint, Prettier, Vitest, Supertest) con endpoint `GET /api/v1/health`.
- PostgreSQL local con Docker Compose (`forno_dev` y `forno_test`).
- `.gitignore`, plantillas `.env.example`, README y documentación inicial.
