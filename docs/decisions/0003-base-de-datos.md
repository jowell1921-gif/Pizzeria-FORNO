# 0003 — Base de datos (Fase 3)

Fecha: 2026-11-07

| Tema                   | Decisión                                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| ORM                    | Prisma **7.10.1** (estable, fijada sin `^`). `prisma@latest` apuntaba a un candidato a versión 8, que no se usa en una base de datos real            |
| Cliente                | Generador `prisma-client` (ESM) con el adaptador `@prisma/adapter-pg`; se genera en `backend/src/generated/` (ignorado por Git, se crea en `npm ci`) |
| Integridad             | Las reglas críticas viven **en la base de datos** (CHECK, índices parciales, triggers), no solo en el código, y cada una tiene prueba                |
| Puntos de fidelización | El saldo solo cambia mediante un trigger al insertar un movimiento del libro, que bloquea la cuenta: la concurrencia queda resuelta por construcción |
| Tablas inmutables      | Libro de puntos, historial de estados, eventos de pago, facturas y auditoría son de solo-añadir                                                      |
| Nombres                | Tablas y columnas en inglés con el nombre por defecto de Prisma (PascalCase / camelCase, entre comillas en SQL)                                      |
| Pruebas                | `npm run test:db` contra `forno_test` (Docker); solo se ejecuta contra bases cuyo nombre termina en `_test`                                          |
| RLS                    | Activado en todas las tablas sin políticas (deny por defecto para los clientes de Supabase)                                                          |

## Incidencias del proceso

- `prisma init` instala «skills» de agentes en `.claude/`, `.windsurf/` y `.agents/`. Se evitó ejecutándolo en una carpeta temporal y escribiendo la configuración a mano, por la regla de no versionar archivos de agentes.
- `prisma migrate reset` exige consentimiento expreso del usuario cuando lo lanza un agente de IA. Se pidió y se obtuvo antes de ejecutarlo sobre la base de desarrollo (vacía) para regenerar la migración inicial.
