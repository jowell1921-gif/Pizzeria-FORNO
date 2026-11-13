# Informe de QA y auditoría (Fase 10)

Fecha: 2026-11-11 · Alcance: toda la plataforma hasta la fase 9 (web, API, base de datos, pagos,
correos y documentos). Datos de demostración; Stripe en modo prueba.

## Resumen

- **Hallazgos críticos: 0. Hallazgos altos: 0.**
- 6 hallazgos de gravedad media, todos **corregidos** en esta fase.
- 7 hallazgos de gravedad baja, abiertos y descritos más abajo (ninguno bloquea).
- Los 10 casos críticos de la sección 16 tienen una prueba de aceptación ejecutada y en verde.

## Pruebas ejecutadas

| Suite                                                                   | Resultado                                                             |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Backend, unitarias (`npm test`)                                         | 48 superadas                                                          |
| Backend, base de datos y API (`npm run test:db`)                        | 389 superadas (31 archivos)                                           |
| Frontend, unitarias (`npm test`)                                        | 431 superadas                                                         |
| Navegador, web pública (`npm run test:e2e`)                             | 347 superadas (37 omitidas a propósito: capturas de pantalla)         |
| Navegador, panel, cocina y cuenta con sesión (`npm run test:e2e:panel`) | 72 superadas (18 pruebas × móvil 320, móvil 390, tablet y escritorio) |
| Tipos, ESLint y Prettier (ambos proyectos)                              | Sin errores                                                           |
| `npm audit` de producción (ambos proyectos)                             | 0 vulnerabilidades                                                    |

**Cobertura** (`npm run test:coverage`): backend 95,8 % de líneas (92,8 % de sentencias, 84,2 % de
ramas, 94,5 % de funciones); frontend 75,2 % de líneas (el código de `src/app` y los componentes de
`ui/` no cuentan). Lo menos cubierto del backend son los dos conectores con servicios externos:
`payments/gateway.ts` (53 %) y `admin/storage.ts` (63 %).

## Casos críticos (sección 16)

Los 10 casos se comprueban de punta a punta por la API real contra PostgreSQL
(`backend/tests/api/critical-cases.test.ts`). La matriz con las pruebas complementarias está en
[`casos-criticos.md`](./casos-criticos.md).

## Auditoría de seguridad

Automática y repetible (`backend/tests/api/security-audit.test.ts`, 14 comprobaciones):

- **Superficie:** más de 80 operaciones documentadas; las únicas públicas son las de una lista
  explícita (carta, promociones, ajustes del local, zonas, cotización, salud y el webhook, que se
  protege con firma).
- **Sin sesión:** todas las operaciones protegidas responden 401 y no devuelven datos. Tokens
  falsos, caducados, de otra clave, con rol `service_role` o anónimos se rechazan.
- **Autorización:** un cliente corriente recibe 403 en **todas** las operaciones de `/admin` y
  `/kitchen`; la cocina y el personal no alcanzan las zonas que no les corresponden; roles, permisos
  e identidad enviados por el cliente (cabeceras, cuerpo, consulta, claims del token) se ignoran.
- **Acceso a datos ajenos (IDOR):** direcciones, pedidos, documentos, sesiones de pago y facturas de
  otra persona responden 404.
- **Entradas maliciosas:** cada operación protegida, con un administrador y 9 cargas distintas
  (SQL, `__proto__`, HTML, textos enormes, tipos erróneos…), no produce ningún error 500 ni filtra
  rutas, trazas o SQL. JSON roto → 400; cuerpo enorme → 413.
- **Cabeceras y CORS:** `nosniff`, HSTS, sin `X-Powered-By`, identificador de petición, solo el
  origen autorizado.
- **Secretos:** ninguna respuesta pública los contiene; ni los archivos ni los 14 commits del
  historial de Git contienen claves (patrones de Stripe, Supabase, Resend, JWT, claves privadas y
  cadenas de conexión). `CLAUDE.md`, `.env` y los originales de imágenes no se han versionado nunca.
- **Base de datos:** RLS con todo denegado en las tablas de negocio (las operaciones críticas pasan
  por el backend); libro de movimientos y facturas inmutables; saldo de puntos nunca negativo.

Decisiones que no son errores y quedan documentadas: la opción «Hazte administrador» está abierta
a todos por ser una demostración (`SELF_ADMIN_ENABLED`; ver decisión 0010); con `false` el servidor
responde 403.

## Rendimiento

**Web pública** (Lighthouse, móvil con red y CPU limitadas):

| Página      | Rendimiento | Accesibilidad | Buenas prácticas | SEO | LCP   | CLS  |
| ----------- | ----------- | ------------- | ---------------- | --- | ----- | ---- |
| Inicio      | 82          | 100           | 100              | 100 | 4,2 s | 0    |
| Carta       | 82          | 96 (*)        | 100              | 100 | 4,3 s | 0    |
| Promociones | 90          | 98 (**)       | 100              | 100 | 0,9 s | 0    |
| FORNEA CLUB | 85          | 96 (*)        | 100              | 100 | 3,9 s | 0,05 |

(*) Ver hallazgo B2: contraste medido mientras el texto aparecía con la animación al desplazar.
(**) El fallo era el orden de encabezados (M4), ya corregido; no se ha vuelto a medir con Lighthouse.

**API** (autocannon, una sola instancia, 30 conexiones simultáneas, sin errores en ninguna):

| Endpoint                        | Peticiones/s | p50    | p99    |
| ------------------------------- | ------------ | ------ | ------ |
| `GET /categories`               | 873          | 32 ms  | 79 ms  |
| `GET /promotions`               | 363          | 79 ms  | 138 ms |
| `GET /store/settings`           | 322          | 87 ms  | 163 ms |
| `GET /orders/me` (sesión)       | 257          | 104 ms | 551 ms |
| `GET /loyalty/account` (sesión) | 210          | 130 ms | 516 ms |
| `GET /products`                 | 167          | 170 ms | 372 ms |
| `GET /store/slots`              | 104          | 266 ms | 387 ms |

Latencia de una sola petición sin cola: `/products` 6 ms, `/store/slots` 10 ms,
`/store/settings` 4 ms.

## Hallazgos

### Críticos y altos

Ninguno.

### Medios (corregidos)

| #   | Hallazgo                                                                                                                                                           | Corrección                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| M1  | El editor de productos desbordaba 14 px en pantallas de 320 px (el selector de archivo de la foto no se encogía)                                                   | `min-w-0` en los campos del panel y ancho completo en el selector                            |
| M2  | Accesibilidad (WCAG 2.5.3, «etiqueta en el nombre»): el nombre accesible de «Canjear · N», de «Quitar grupo» y del enlace «Mi cuenta» no contenía el texto visible | Nombres accesibles que incluyen el texto visible                                             |
| M3  | La documentación OpenAPI y `docs/api` seguían diciendo que solo se admite efectivo                                                                                 | Actualizadas con el pago online y el estado «pendiente de pago»                              |
| M4  | Orden de encabezados incorrecto en `/promociones` (de h1 a h3)                                                                                                     | Las tarjetas usan h2 bajo el h1                                                              |
| M5  | El panel, la cocina y «Mi cuenta» no tenían pruebas de navegador con sesión ni en móvil, tablet y escritorio                                                       | 72 pruebas nuevas (contenido por rol, sin desbordamientos, sin errores de consola y con axe) |
| M6  | No había integración continua                                                                                                                                      | `.github/workflows/ci.yml` (tipos, lint, formato, pruebas, compilación y navegador)          |

### Bajos (abiertos)

| #   | Hallazgo                                                                                                            | Nota                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1  | `npm audit` completo (con herramientas de desarrollo): backend 10 y frontend 13 avisos moderados o bajos            | Solo en dependencias de desarrollo; producción tiene 0. Arreglarlos exige actualizaciones incompatibles (`--force`)                                                                                                            |
| B2  | Lighthouse marca contraste insuficiente en `/carta` y `/fornea-club`                                                | Falso positivo: mide el texto mientras aparece con la animación al desplazar. Con «reducir movimiento» y con axe (WCAG 2.2 AA) pasan                                                                                           |
| B3  | LCP de 4 s en móvil con red lenta simulada (medido sin simulación: servidor 46 ms + imagen 0,64 s + pintado 0,23 s) | La imagen principal ya es WebP de 84 KB con prioridad alta; la mejora posible es reducir JavaScript                                                                                                                            |
| B4  | Consultas repetidas (N+1 leve) en el listado de promociones del panel y al evaluar promociones automáticas          | Pocas filas; no afecta al cliente                                                                                                                                                                                              |
| B5  | Los conectores con Stripe y Supabase Storage tienen poca cobertura automática                                       | Stripe se verificó contra el servicio real en modo prueba (sesión, consulta, cierre y un pago con tarjeta completo con su webhook); Storage, con una subida real. El reembolso real solo está probado con la pasarela simulada |
| B6  | Con 30 conexiones simultáneas `/products` y `/store/slots` rinden 167 y 104 peticiones/s en una sola instancia      | Suficiente para la demo; la mejora sería una caché en memoria (las respuestas públicas ya llevan caché HTTP de 30 s)                                                                                                           |
| B7  | Existe una carpeta vacía `Pizzeria-FORNO/` en la raíz del proyecto, con su propio `.git`, ignorada por Git          | Pendiente de que el propietario autorice borrarla                                                                                                                                                                              |

## Reproducibilidad (sección 21)

Se simuló un clon limpio (solo los archivos que Git versionaría, en una carpeta temporal, sin
`node_modules` ni `.env`) y se ejecutó: `npm ci` (ambos proyectos), tipos, ESLint, Prettier, pruebas
unitarias y compilación (superados en los dos), y la suite completa de base de datos y API sobre una
base vacía (migraciones desde cero). Resultado de la suite de base de datos en el clon limpio:
389 pruebas superadas sobre una base vacía y una instalación nueva.

Dependen del propietario y no se pueden verificar desde aquí: los correos reales (Resend con dominio
verificado), el despliegue en Vercel, Railway y Supabase de producción, el webhook de Stripe en
producción y las copias de seguridad (fase 11).

## Cómo repetir las comprobaciones

```bash
# Backend (con Docker: docker compose up -d)
cd backend
npm run typecheck && npm run lint && npm run format:check
npm test                       # unitarias
npm run test:db                # base de datos y API, incluidos los casos críticos y la auditoría
npm run test:coverage          # cobertura

# Frontend
cd frontend
npm run typecheck && npm run lint && npx prettier --check .
npm test && npm run build
npm run test:e2e               # web pública
npm run test:e2e:panel         # panel, cocina y cuenta con sesión simulada
npm run test:coverage
```
