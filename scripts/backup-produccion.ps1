<#
.SYNOPSIS
  Copia de seguridad de la base de datos de FORNEA (esquema "public") en un archivo .dump.

.DESCRIPTION
  Hace la copia con el pg_dump 17 del contenedor de Docker local (forno-postgres), así que no hay que
  instalar PostgreSQL. La cadena de conexión de producción (la del "Session pooler" de Supabase, la
  misma que DATABASE_URL en Railway) se pide por teclado SIN mostrarla, o se toma de la variable de
  entorno FORNEA_DB_URL. Nunca se guarda en ningún archivo.

  Las copias se guardan en la carpeta "backups" (ignorada por Git: contiene datos personales de
  clientes, trátalas conforme al RGPD) y se conservan las últimas 8.

  Qué cubre: clientes, pedidos, pagos, puntos, facturas, carta y ajustes (esquema "public").
  Qué NO cubre: las contraseñas y la identidad de los usuarios (esquema "auth" de Supabase) ni las
  fotos de Storage. Ver docs/deployment/copias-de-seguridad.md.

.EXAMPLE
  .\scripts\backup-produccion.ps1
#>
[CmdletBinding()]
param(
  [string] $Container = "forno-postgres",
  [string] $OutputDir = "",
  [int] $Keep = 8
)

# Los comandos de Docker escriben avisos por el canal de errores: no deben cortar el script (se
# comprueba el código de salida de cada uno).
$ErrorActionPreference = "Continue"

# Carpeta de destino: «backups» en la raíz del repositorio (junto a la carpeta de este script).
if (-not $OutputDir) {
  $here = Split-Path -Parent $MyInvocation.MyCommand.Path
  $OutputDir = Join-Path (Split-Path -Parent $here) "backups"
}

function Fail($message) { Write-Host "ERROR: $message" -ForegroundColor Red; exit 1 }

# 1. Docker y el contenedor con pg_dump.
docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "Docker no está en marcha. Abre Docker Desktop y repite." }
$running = docker ps --filter "name=^/$Container$" --format "{{.Names}}"
if (-not $running) { Fail "El contenedor '$Container' no está en marcha. Ejecuta: docker compose up -d" }

# 2. Cadena de conexión (sin mostrarla).
$url = $env:FORNEA_DB_URL
if (-not $url) {
  $secure = Read-Host "Cadena de conexión de la base de datos (Session pooler de Supabase)" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $url = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
if ($url -notmatch '^postgres(ql)?://') { Fail "La cadena debe empezar por postgresql://" }

# 3. Copia dentro del contenedor (formato comprimido, solo el esquema "public").
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$remote = "/tmp/fornea-$stamp.dump"
$local = Join-Path (Resolve-Path $OutputDir) "fornea-$stamp.dump"

Write-Host "Haciendo la copia..."
docker exec -e "FORNEA_DB_URL=$url" $Container sh -c "pg_dump `"`$FORNEA_DB_URL`" --schema=public --format=custom --no-owner --no-acl --file $remote"
if ($LASTEXITCODE -ne 0) { docker exec $Container rm -f $remote 2>&1 | Out-Null; Fail "pg_dump falló. Revisa la cadena de conexión (¿es la del Session pooler?)." }

# 4. Comprobación: el archivo se puede leer y contiene las tablas (se hace antes de sacarlo del contenedor).
$tables = [int](docker exec $Container sh -c "pg_restore --list $remote | grep -c 'TABLE DATA'")
if ($tables -lt 10) { docker exec $Container rm -f $remote 2>&1 | Out-Null; Fail "La copia no parece válida ($tables tablas con datos). Se ha descartado." }

docker cp "${Container}:$remote" $local
docker exec $Container rm -f $remote 2>&1 | Out-Null
if (-not (Test-Path $local)) { Fail "No se pudo copiar el archivo desde el contenedor." }

$size = [math]::Round((Get-Item $local).Length / 1KB)
Write-Host "Copia correcta: $local ($size KB, $tables tablas con datos)" -ForegroundColor Green

# 5. Conserva solo las últimas copias.
Get-ChildItem $OutputDir -Filter "fornea-*.dump" | Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $Keep | ForEach-Object { Remove-Item $_.FullName -Force; Write-Host "Borrada la copia antigua $($_.Name)" }

Write-Host "Guarda también una copia fuera de este ordenador (almacenamiento cifrado). No la subas a GitHub."
