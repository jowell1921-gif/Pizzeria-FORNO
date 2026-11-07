# Registro de cambios

## [Sin publicar]

### Fase 4 — Autenticación

- Backend: verificación de los access tokens de Supabase con JWKS (`ES256`/`RS256`), perfil creado de forma idempotente en la primera petición, roles y permisos leídos siempre de la base de datos, matriz de permisos explícita y endpoints `GET`/`PATCH /api/v1/me`.
- Formato de errores unificado con `requestId`; `npm run roles` para crear el primer administrador, con auditoría y protección del último administrador.
- Frontend: clientes de Supabase, `proxy.ts` para proteger `/cuenta`, `/admin` y `/kitchen`, páginas de acceso, registro, recuperación y restablecimiento de contraseña, acceso con Google, callbacks de confirmación y «Mi cuenta» con edición del perfil.
- Enlace «Acceder / Mi cuenta» en la cabecera; el menú completo pasa a mostrarse desde 1024 px.
- Pruebas: 127 de base de datos y API, 24 unitarias del backend, 224 unitarias del frontend y 279 E2E. Los flujos reales de correo y Google quedan pendientes de verificar con un proyecto de Supabase.
- Documentación: `docs/security/supabase-auth.md` (guía de configuración) y decisión `0005`.
- Perfil: nombre de usuario (3–12 caracteres, es el que se muestra en el botón de la cabecera) y teléfono obligatorios (restricciones también en la base de datos). Endpoints de puntos, pedidos propios y direcciones.
- «Mi cuenta»: datos y ajustes en modo lectura con «Editar datos», puntos, código promocional (solo se guarda en el navegador; lo valida el servidor al pedir), pedidos, direcciones, cambio de contraseña y cierre de sesión. Un cliente nuevo completa primero sus datos y vuelve a la página principal.
- Pantalla de acceso con panel animado de ventajas (iconos de promociones, puntos y reparto) en lugar de una tarjeta suelta.
- Carta, favoritos y promociones: al pulsar un producto se abre su ficha con «Pedir ahora» (el pedido real llega en la fase 6) y al pulsar una promoción, su detalle con el código para copiar.
- El texto y los botones del hero ya no se vuelven transparentes al hacer scroll.
- Plantillas de correo de Supabase con el logo (`docs/security/email-templates/`); editarlas exige configurar un SMTP propio.

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
