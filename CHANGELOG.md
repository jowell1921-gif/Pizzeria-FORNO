# Registro de cambios

## [Sin publicar]

### Fase 9 — Pagos, correos, facturas y tickets

- Pago online con **Stripe Checkout**: el pedido nace «pendiente de pago» y solo un webhook con firma verificada lo confirma (importe y moneda comprobados, idempotente). Pagos fallidos y sesiones caducadas cancelan el pedido; un cobro tardío se devuelve solo. Reembolsos totales o parciales desde el panel, con auditoría, y automáticos al cancelar un pedido pagado.
- Correos de pedido (siete avisos) con cola, reintentos y registro; por defecto se guardan sin enviar y se leen en el panel (**Correos**). Envío real opcional con Resend (`EMAIL_DRIVER=resend`, `EMAIL_ONLY_TO` para el modo sin dominio).
- Tickets y facturas en PDF con numeración correlativa e inmutable y desglose del IVA; descarga desde el pedido y desde el panel; factura con los datos fiscales del cliente.
- Web: elegir pago con tarjeta o efectivo, «Pagar ahora» y espera de confirmación en el pedido, ticket y factura, y en el panel el reembolso y los correos.
- Base de datos: contenido de los avisos y estado «registrado» (migración `notification_content`).
- Dependencias nuevas: `stripe` y `pdfkit` (backend).
- Documentación: decisión `0012`, `docs/api/README.md`, OpenAPI y `.env.example`.

### Fase 8C — PizzAI, etapa 1 (interfaz)

- Asistente virtual PizzAI: pizza animada flotante en la esquina inferior derecha de la web pública (no en el panel ni en `/pedido`), con ventana de chat, sugerencias, indicador de «escribiendo» y respuestas de demostración marcadas como provisionales. Sin IA ni acceso a datos.
- Arquitectura lista para la etapa 2: la interfaz depende solo de `AssistantClient`.
- Accesibilidad y móvil: foco gestionado, `aria-live`, Escape, movimiento reducido respetado y chat a casi pantalla completa en móvil.
- Pruebas: 407 unitarias y 343 E2E en el frontend (incluye axe con el chat abierto).
- Documentación: decisión `0011`.

### Fase 8B — Administración del negocio

- Backend: carta (productos, categorías, opciones, alérgenos, disponibilidad, precios), establecimiento (datos, horarios, festivos, tiempos, zonas, mínimo, pausa de pedidos, métodos de pago), promociones y cupones (con promociones **automáticas**), FORNO CLUB (puntos por euro, recompensas, movimientos, canjes, clientes y ajustes justificados), registro de auditoría y subida de fotos a Supabase Storage. Cada escritura exige un permiso explícito, se valida en el servidor y deja constancia antes/después.
- Base de datos: `Promotion.automatic` (migración `promotion_automatic`).
- Pedidos: la promoción automática se evalúa en el presupuesto y se vuelve a comprobar con bloqueo al crear el pedido (`409 PROMOTION_CHANGED` si deja de cumplirse).
- Web: nuevas pantallas del panel — Carta, Promociones, FORNO CLUB, Establecimiento y Auditoría — visibles solo según el rol.
- Pruebas: 48 unitarias y 319 de base de datos y API en el backend; 375 unitarias y 331 E2E en el frontend.
- Documentación: decisión `0010`, `docs/api/README.md` y OpenAPI.
- Cocina: los pedidos a domicilio listos ya no quedan colgados; la cocina los entrega al repartidor y dejan de aparecer.
- Demostración: ventana al entrar para ofrecer ser administrador y botón «Hazte administrador» / «Dejar de ser administrador» en «Mi cuenta» (`SELF_ADMIN_ENABLED`, activado por defecto al ser una demostración). El botón de la cabecera junto al carrito pasa a ser «Panel del personal» para el personal.

### Fase 8A — Pedidos del personal, cocina y panel de control

- Backend: `GET/PATCH /admin/orders` (filtros, paginación, detalle, cambio de estado con motivo y auditoría), `GET /admin/dashboard`, `GET/PATCH /kitchen/orders` y flujos SSE (`/admin/stream`, `/kitchen/stream`). Cada ruta exige un permiso explícito; la cocina solo recibe lo necesario para preparar (sin datos del cliente, importes ni pagos).
- Web: zona privada independiente (`/admin`, `/admin/pedidos`, `/admin/pedidos/[id]`, `/kitchen`) con panel de control, lista y detalle de pedidos con los cambios de estado válidos, y pantalla de cocina por columnas con acciones rápidas y actualización en directo (con consulta periódica de respaldo). Enlace «Panel del personal» en «Mi cuenta» para quien tiene permisos.
- Pruebas: 48 unitarias y 267 de base de datos y API en el backend; 350 unitarias y 315 E2E en el frontend.
- Documentación: decisión `0009`, `docs/api/README.md` y OpenAPI.

### Fase 7 — FORNO CLUB y promociones

- Puntos: se conceden solo al completar el pedido (una vez, aunque se complete dos veces o a la vez), sobre productos menos descuentos y sin gasto de envío; se revierten al cancelar o devolver sin dejar saldo negativo, y se devuelven completos los puntos gastados en una recompensa.
- Canje de recompensas (`POST /loyalty/redemptions`, con `Idempotency-Key`): atómico y seguro ante peticiones simultáneas; la recompensa pasa a «Mis recompensas» y se usa en un pedido con `redemptionId`.
- Cupones validados en el servidor (fechas, estado, mínimo, primer pedido, límites de uso, cupón personal, productos, combos), incluso ante pedidos simultáneos; el IVA se calcula sobre lo realmente pagado.
- Máquina de estados del pedido (`changeOrderStatus`): historial, cobro o anulación del efectivo y fidelización en una transacción. El cliente puede cancelar su pedido mientras no esté aceptado.
- Ajustes administrativos de puntos con motivo y auditoría (servicio; las pantallas, en la fase 8).
- Web: canjear recompensas y «Mis recompensas» en la cuenta, paso «Descuentos» en el checkout (el código guardado en «Mi cuenta» se aplica solo), cancelar pedido, y FORNO CLUB (inicio y página del club) desde la API.
- Pruebas: 48 unitarias y 250 de base de datos y API en el backend; 318 unitarias y 311 E2E en el frontend.
- Documentación: decisión `0008` y `docs/api/README.md`.

### Fase 6 — Pedidos y checkout

- Backend: presupuesto del carrito (`POST /checkout/quote`), carrito guardado (`/cart`), franjas horarias (`/store/slots`) y creación de pedidos (`POST /orders`) con `Idempotency-Key`. Precios, IVA, envío, mínimo, zona, horario y método de pago se calculan y validan en el servidor; el cliente solo envía identificadores y cantidades.
- Solo efectivo hasta la fase 9: el pago online no se anuncia ni se acepta sin proveedor.
- Web: la carta, los favoritos y las promociones salen de la API; ficha de producto con tamaño, masa, extras, cantidad y nota; carrito en panel lateral con botón en la cabecera, guardado en el navegador y sincronizado con el servidor; checkout (`/pedido`) con modalidad, dirección, hora, pago, observaciones y resumen; seguimiento del pedido (`/pedido/[id]`) con actualización automática.
- Corregido: con el local cerrado, el checkout permitía confirmar sin elegir hora.
- El checkout explica qué falta para confirmar, elige por defecto una dirección con reparto y marca las que no lo tienen.
- Imágenes de la carta: 14 fotografías procesadas (fondo blanco eliminado, recortadas y exportadas a WebP con transparencia) asignadas a cada producto, y nuevo banner de «Nuestra carta». Los originales quedan en `frontend/assets-originals/` (fuera de Git).
- OpenAPI y pruebas de contrato actualizadas.
- Pruebas: 48 unitarias y 213 de base de datos y API en el backend; 299 unitarias en el frontend; 307 E2E contra la API real.
- Documentación: `docs/api/README.md` y decisión `0007`.

### Fase 5 — Backend y API

- Endpoints públicos: `/categories`, `/products` (filtros y detalle por id o slug), `/promotions`, `/store/settings` (con horario, días especiales y si está abierto ahora) y `/delivery-zones` (con comprobación por código postal).
- Seguridad: límite de peticiones por IP, por usuario y en escrituras (`429 RATE_LIMITED`), `TRUST_PROXY` explícito, CORS acotado, registros JSON con `requestId` sin cabeceras ni cuerpos y caché pública de 30 s.
- Documentación OpenAPI 3.1 generada desde los esquemas Zod de respuesta, con Swagger UI propio en `/api/v1/docs` (sin CDN; en producción solo con `API_DOCS_ENABLED=true`).
- Pruebas de contrato contra PostgreSQL: las respuestas coinciden con la documentación (detectaron que `orderNumber` es entero).
- Pruebas: 39 unitarias y 186 de base de datos y API en el backend.
- Documentación: `docs/api/README.md` y decisión `0006`.

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
