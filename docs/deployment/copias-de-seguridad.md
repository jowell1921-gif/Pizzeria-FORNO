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

## Copia de la base de datos de producción: `scripts/backup-produccion.ps1`

Es lo que hay que usar hoy: el plan gratuito de Supabase no incluye copias descargables. El script
hace la copia con el `pg_dump` 17 del contenedor de Docker local (no hay que instalar PostgreSQL):

```powershell
docker compose up -d                       # el contenedor forno-postgres debe estar en marcha
powershell -ExecutionPolicy Bypass -File .\scripts\backup-produccion.ps1   # pide la cadena SIN mostrarla
```

- Pide la cadena del **Session pooler** de Supabase (la misma que `DATABASE_URL` en Railway); también
  admite la variable de entorno `FORNEA_DB_URL`. No la guarda en ningún archivo.
- Deja el archivo en `backups/fornea-AAAAMMDD-HHMM.dump` (carpeta **ignorada por Git**) y conserva las 8
  últimas. Comprueba antes de guardarlo que el archivo se puede leer y que contiene las tablas.
- **Qué cubre:** el esquema `public`, es decir, clientes, pedidos, pagos, puntos, facturas, carta y
  ajustes. **Qué no cubre:** las contraseñas e identidades de los usuarios (esquema `auth` de Supabase,
  que gestiona Supabase) ni las fotos de Storage. Para recuperarse de un desastre, los usuarios deberían
  volver a registrarse o recuperar su acceso; sus pedidos y puntos se conservan en la copia.
- Los `.dump` contienen datos personales: guárdalos cifrados y fuera de este ordenador, y no los subas a GitHub.

### Restaurar una copia de `backup-produccion.ps1`

Siempre en una base **nueva**. Hay que crear antes la extensión `btree_gist`: dos restricciones del
horario de apertura la necesitan y, sin ella, se restaurarían sin ellas:

```powershell
docker cp .\backups\fornea-AAAAMMDD-HHMM.dump forno-postgres:/tmp/restaurar.dump
docker exec forno-postgres psql -U forno -d postgres -c "CREATE DATABASE forno_restaurada;"
docker exec forno-postgres psql -U forno -d forno_restaurada -c "CREATE EXTENSION IF NOT EXISTS btree_gist;"
docker exec forno-postgres pg_restore -U forno -d forno_restaurada --no-owner --no-acl /tmp/restaurar.dump
```

El único aviso esperado es `schema "public" already exists` (inocuo). Para un proyecto nuevo de
Supabase, la extensión se crea en su panel (Database → Extensions → `btree_gist`) y se restaura con
`pg_restore` apuntando a la cadena del nuevo proyecto.

## Copia manual con pg_dump (recomendada antes de cada migración importante y de forma periódica)

Necesitas las herramientas de PostgreSQL 17 (`pg_dump`, `pg_restore`) y la cadena de conexión.

```bash
# Copia (formato comprimido y restaurable por partes)
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl \
  --file "fornea-$(date +%Y%m%d-%H%M).dump"
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

## Ensayo del script (hecho el 2026-11-17, en local)

Se probó `backup-produccion.ps1` contra la base de desarrollo, se restauró en una base nueva (con
`btree_gist` creada antes) y se compararon las tablas clave: `Profile` 3/3, `Order` 8/8, `Payment` 8/8,
`LoyaltyTransaction` 4/4, `Product` 15/15, `AuditLog` 9/9, `_prisma_migrations` 7/7. Tablas sin RLS: 0.
Restricciones de exclusión: 2 en el origen y 2 en la restaurada. El ensayo detectó que, sin crear antes
`btree_gist`, esas dos restricciones se pierden: ya está en el procedimiento de arriba.

**Pendiente (del propietario):** hacer la primera copia de la base **real** de producción y anotar aquí la
fecha. Una copia que no se ha probado no es una copia.

## Calendario sugerido

| Frecuencia                              | Qué                                                   |
| --------------------------------------- | ----------------------------------------------------- |
| Diaria                                  | Copia automática de Supabase (solo en planes de pago) |
| Semanal                                 | `scripts/backup-produccion.ps1`, guardada fuera       |
| Antes de cada migración o cambio grande | Copia manual                                          |
| Trimestral                              | Ensayo de restauración en una base nueva              |
