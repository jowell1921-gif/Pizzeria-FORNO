# FORNO

Plataforma web de pedidos, gestión de restaurante y fidelización para la pizzería ficticia FORNO. Proyecto de demostración: los datos comerciales son de ejemplo.

## Estructura

| Carpeta     | Contenido                                             |
| ----------- | ----------------------------------------------------- |
| `frontend/` | Aplicación Next.js (App Router, TypeScript, Tailwind) |
| `backend/`  | API REST Express + TypeScript (`/api/v1`)             |
| `docs/`     | Arquitectura y decisiones técnicas                    |
| `docker/`   | Scripts de inicialización de PostgreSQL local         |

Frontend y backend son proyectos independientes, cada uno con su `package.json` y `package-lock.json`.

## Requisitos previos

- Node.js 22 o superior (probado con 24)
- npm 10 o superior
- Docker con Docker Compose
- Git

## Instalación desde un clon limpio

```bash
# 1. Base de datos local (PostgreSQL 17 en Docker)
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env
npm ci                 # también genera el cliente de Prisma
npm run db:deploy      # aplica las migraciones a forno_dev
npm run db:seed        # (opcional) datos de demostración
npm run dev            # http://localhost:4000/api/v1/health

# 3. Frontend (en otra terminal)
cd frontend
cp .env.example .env.local
npm ci
npm run dev            # http://localhost:3000
```

En PowerShell, sustituye `cp` por `Copy-Item`.

## Scripts

Disponibles en `frontend/` y en `backend/`:

| Comando                           | Acción                    |
| --------------------------------- | ------------------------- |
| `npm run dev`                     | Servidor de desarrollo    |
| `npm run build`                   | Compilación de producción |
| `npm run typecheck`               | Comprobación de tipos     |
| `npm run lint`                    | ESLint                    |
| `npm run format` / `format:check` | Prettier                  |
| `npm test`                        | Pruebas con Vitest        |

Solo en `frontend/`:

| Comando                           | Acción                                                                                                                                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx playwright install chromium` | Descarga el navegador para las pruebas E2E (una sola vez)                                                                                                                                                      |
| `npm run test:e2e`                | Pruebas de navegador (responsive, navegación, accesibilidad y compra). Necesitan PostgreSQL local (docker compose up -d): siembran la base `forno_test`, arrancan la API en el puerto 4100 y la web en el 3100 |

| `npm run test:e2e:panel` | Pruebas de navegador del panel, la cocina y «Mi cuenta» **con sesión** (móvil, tablet y escritorio). Usan la API y la web reales y sustituyen solo Supabase Auth por un servidor local de pruebas (puertos 3200, 4200 y 4300; base `forno_test`) |
| `npm run test:coverage` | Informe de cobertura de las pruebas unitarias |

Para generar capturas de revisión visual: establece la variable `CAPTURE=1` y ejecuta `npx playwright test screenshots`. Se guardan en `frontend/test-results/screens/`.

Solo en `backend/`:

| Comando                                           | Acción                                                                                    |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run db:migrate`                              | Crea y aplica una migración en desarrollo                                                 |
| `npm run db:deploy`                               | Aplica las migraciones pendientes                                                         |
| `npm run db:seed`                                 | Siembra los datos de demostración (idempotente)                                           |
| `npm run db:generate`                             | Genera el cliente de Prisma                                                               |
| `npm run test:db`                                 | Pruebas de integridad de la base de datos y de la API (necesita Docker; usa `forno_test`) |
| `npm run test:coverage`                           | Informe de cobertura del servidor (pruebas de base de datos y API)                        |
| `npm run perf`                                    | Mide el rendimiento de los endpoints principales (autocannon; usa `forno_test`)           |
| `npm run docs:openapi`                            | Regenera `docs/api/openapi.json` (el contrato para Flutter)                               |
| `npm run docs:schema`                             | Regenera el diagrama de la base de datos `docs/database/diagrama.md`                      |
| `npm run roles -- grant correo@ejemplo.com ADMIN` | Concede o retira (`revoke`) un rol: `ADMIN`, `STAFF` o `KITCHEN`                          |

`npm test` en el backend no necesita base de datos. Más información en `docs/database/`.

## Documentación

| Tema                                                                           | Dónde                           |
| ------------------------------------------------------------------------------ | ------------------------------- |
| Arquitectura                                                                   | `docs/architecture/overview.md` |
| Base de datos y diagrama                                                       | `docs/database/`                |
| API: convenciones, endpoints y contrato OpenAPI                                | `docs/api/` (`openapi.json`)    |
| App Flutter: guía de integración, ejemplos reales, errores y reglas de negocio | `docs/flutter/`                 |
| Autenticación y seguridad                                                      | `docs/security/`                |
| Despliegue y operación                                                         | `docs/deployment/`              |
| Calidad, casos críticos y criterios de aceptación                              | `docs/quality/`                 |
| Decisiones técnicas                                                            | `docs/decisions/`               |
| Registro de cambios                                                            | `CHANGELOG.md`                  |

## Calidad y auditoría

Cada subida y cada solicitud de cambios pasan por la integración continua (`.github/workflows/ci.yml`): tipos, lint, formato, pruebas unitarias, de base de datos y de navegador, y compilación. El informe de la fase 10 (pruebas ejecutadas, cobertura, auditoría de seguridad, rendimiento y hallazgos) está en `docs/quality/informe-qa.md`, y la matriz de los casos críticos en `docs/quality/casos-criticos.md`.

## API y documentación

Con el backend en marcha, la documentación interactiva está en `http://localhost:4000/api/v1/docs` y el contrato en `/api/v1/openapi.json`. Convenciones, ejemplos y límites de peticiones: `docs/api/README.md`.

## Autenticación

El acceso de usuarios usa Supabase Auth. Sin configurarlo, la web pública funciona y las páginas de acceso muestran un aviso. Para activarlo, crea un proyecto de Supabase y sigue `docs/security/supabase-auth.md` (incluye Google y el primer administrador).

## Base de datos local

`docker compose up -d` crea dos bases en el mismo servidor PostgreSQL: `forno_dev` (desarrollo) y `forno_test` (pruebas). Las credenciales de `docker-compose.yml` son solo para uso local.

```bash
docker compose down        # detener (conserva los datos)
docker compose down -v     # detener y borrar los datos
```

## Variables de entorno

Cada proyecto incluye un `.env.example` con todas las variables y su explicación. Los archivos `.env` reales nunca se suben al repositorio.

## Estado

**Las 12 fases están completadas.** Plataforma de pedidos con carta dinámica, carrito y checkout, recogida y domicilio, pago en efectivo y con tarjeta (Stripe), FORNO CLUB, promociones, panel del personal, pantalla de cocina en directo, correos de pedido, tickets y facturas, y PizzAI (asistente, con IA real opcional). API documentada y lista para la futura app Flutter. Criterios de aceptación y limitaciones conocidas: `docs/quality/criterios-aceptacion.md`.

Es una demostración: los datos comerciales son de ejemplo y **no se ha publicado nada**. Para publicarla, sigue `docs/deployment/`; para activar lo que depende de cuentas externas (pagos reales, correo con dominio, IA), consulta cada decisión en `docs/decisions/`.
