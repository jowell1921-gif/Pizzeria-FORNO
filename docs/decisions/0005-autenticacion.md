# 0005 — Autenticación (Fase 4)

Fecha: 2026-11-07

| Tema                        | Decisión                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proveedor                   | Supabase Auth (correo y Google), compartido por web y Flutter                                                                                      |
| Verificación en el backend  | Con `jose` y el JWKS público del proyecto, solo `ES256` y `RS256`. No se usa un secreto compartido (`HS256`); sin llamadas a Supabase por petición |
| Roles y permisos            | En nuestra base de datos (`UserRole`), nunca en el token ni en el cliente. Matriz explícita en `backend/src/auth/permissions.ts`                   |
| Perfil                      | Se crea en la primera petición autenticada (idempotente y seguro ante peticiones simultáneas); no hay triggers sobre `auth.users`                  |
| Primer administrador        | Se crea desde la terminal (`npm run roles`), con auditoría y sin poder dejar la plataforma sin administradores                                     |
| Rutas protegidas (web)      | `src/proxy.ts` (en Next 16 sustituye a `middleware.ts`). Es solo experiencia de usuario; la seguridad real está en el backend                      |
| Sesión en el servidor       | `getClaims()` (comprueba la firma); nunca `getSession()` en código de servidor                                                                     |
| Claves de Supabase          | Variable `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (la antigua `anon` está en desuso). La clave secreta no se usa y no puede estar en el frontend     |
| Consentimiento de marketing | No se pide al registrarse: es una casilla explícita en «Mi cuenta»                                                                                 |
| Navegación                  | El menú completo pasa de 768 px a **1024 px**: al añadir «Acceder» ya no cabía en tabletas, que usan el menú desplegable                           |
| Sin configuración           | Sin claves de Supabase la web pública funciona y las páginas de acceso avisan en lugar de fallar                                                   |
| Pruebas                     | Claves generadas en las propias pruebas para firmar tokens; los flujos reales (correo y Google) se verifican a mano con un proyecto configurado    |

## Estado de la verificación

- **Verificado automáticamente:** verificación de tokens, roles, permisos, protección de rutas, formularios, redirecciones seguras, accesibilidad y responsive.
- **Sin verificar todavía:** el flujo real de registro con correo, la confirmación, la recuperación de contraseña y Google. Necesitan un proyecto de Supabase y credenciales de Google creados por el propietario (guía en `docs/security/supabase-auth.md`). No se han simulado.

## Incidencias del proceso

- Dos subagentes de lectura web no pudieron leer el PDF de tipos de IVA ni la guía de Supabase para Next.js (el contenido llegó sin el código). La información que sí llegó (nombres de las claves, `getClaims`, `proxy.ts`, JWKS) se contrastó con la documentación local de Next.js 16.4 y con las pruebas.
