# Copias de seguridad y restauración

## Qué hay que proteger

| Dato                                                                       | Dónde vive                              | Cómo se protege                                                                                                  |
| -------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Base de datos (clientes, pedidos, pagos, puntos, facturas, carta, ajustes) | PostgreSQL de Supabase                  | Copias automáticas de Supabase + copia manual con `pg_dump` (abajo)                                              |
| Fotos de la carta                                                          | Supabase Storage (bucket `products`)    | Se pueden volver a subir desde los originales; guarda una copia de las imágenes originales fuera del repositorio |
| Usuarios y contraseñas (identidad)                                         | Supabase Auth (esquema `auth`)          | Forman parte de la copia de Supabase                                                                             |
| Código y migraciones                                                       | GitHub                                  | El propio repositorio                                                                                            |
| Secretos                                                                   | Variables de Railway, Vercel y Supabase | Guárdalos en un gestor de contraseñas; **no** están en Git                                                       |
| Pagos                                                                      | Stripe                                  | Stripe conserva el historial; es la fuente de verdad del dinero cobrado                                          |

## Copias automáticas de Supabase

Activa y comprueba en el panel de Supabase (Database → Backups) qué copias incluye tu plan: los
planes de pago incluyen copias diarias, y la recuperación a un punto concreto (PITR) es un
complemento. **Los planes gratuitos pueden no incluir copias descargables**: en ese caso, la copia
manual de abajo es imprescindible. Comprueba en tu plan los plazos de retención.

## Copia manual (recomendada antes de cada migración importante y de forma periódica)

Necesitas las herramientas de PostgreSQL 17 (`pg_dump`, `pg_restore`) y la cadena de conexión.

```bash
# Copia (formato comprimido y restaurable por partes)
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl \
  --file "forno-$(date +%Y%m%d-%H%M).dump"
```

Guarda el archivo `.dump` fuera del repositorio y del ordenador de trabajo (por ejemplo, en un
almacenamiento cifrado). Contiene datos personales de clientes: trátalo conforme al RGPD y no lo
subas a GitHub.

Con el PostgreSQL local de Docker (sin instalar nada):

```bash
docker exec forno-postgres pg_dump -U forno -d forno_dev --format=custom --no-owner --no-acl -f /tmp/forno.dump
docker cp forno-postgres:/tmp/forno.dump ./forno.dump
```

## Restauración

**Siempre sobre una base vacía y nueva**, nunca encima de la de producción sin haber copiado antes
lo que haya.

```bash
createdb -U <usuario> forno_restaurada
pg_restore -U <usuario> -d forno_restaurada --no-owner --no-acl forno.dump
```

Después, comprueba que los datos están (recuentos de `Profile`, `Order`, `Payment`,
`LoyaltyTransaction`, `Product`, `Invoice`, `AuditLog`) y que las tablas conservan la protección RLS
(`SELECT count(*) FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity` debe dar 0).

Para volver a producción tras un desastre: restaurar en un proyecto nuevo de Supabase, apuntar
`DATABASE_URL` de Railway a él y redesplegar.

## Ensayo de restauración (hecho el 2026-11-11, en local)

Se hizo una copia de la base de desarrollo con `pg_dump`, se restauró en una base nueva y se
comparó cada tabla clave:

| Tabla                | Origen | Restaurada |
| -------------------- | ------ | ---------- |
| `Profile`            | 3      | 3          |
| `Order`              | 8      | 8          |
| `Payment`            | 8      | 8          |
| `LoyaltyTransaction` | 4      | 4          |
| `Product`            | 15     | 15         |
| `NotificationLog`    | 8      | 8          |
| `AuditLog`           | 9      | 9          |
| `_prisma_migrations` | 6      | 6          |

Tablas sin RLS tras restaurar: 0. **Falta repetir el ensayo con la base real de producción** cuando
exista, y anotar la fecha aquí: una copia que no se ha probado no es una copia.

## Calendario sugerido

| Frecuencia                              | Qué                                                  |
| --------------------------------------- | ---------------------------------------------------- |
| Diaria                                  | Copia automática de Supabase (comprobar que se hace) |
| Semanal                                 | Copia manual con `pg_dump` guardada fuera            |
| Antes de cada migración o cambio grande | Copia manual                                         |
| Trimestral                              | Ensayo de restauración en una base nueva             |
