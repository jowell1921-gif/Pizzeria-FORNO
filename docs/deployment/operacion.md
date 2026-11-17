# Operación: monitorización, registros y rutina

## Comprobaciones de salud

| URL                        | Para qué                                                                  | Quién la usa                                                |
| -------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `GET /api/v1/health`       | Vivacidad: el proceso responde (no toca la base de datos)                 | Railway (`healthcheckPath`): si falla, reinicia el servicio |
| `GET /api/v1/health/ready` | Disponibilidad: además, la base de datos responde (`503 NOT_READY` si no) | Un monitor externo de disponibilidad                        |

No uses `/health/ready` como comprobación de reinicio: un corte breve de la base de datos
reiniciaría el servicio sin arreglar nada.

**Monitor de disponibilidad (obligatorio en la demostración).** Además de avisar si algo cae, mantiene
activa la API y la base de datos: el plan gratuito de Supabase **pausa el proyecto tras una semana sin
actividad** y, pausado, ni el login ni los pedidos funcionan hasta reactivarlo a mano. Con un monitor que
consulta la API cada pocos minutos eso no ocurre. Configuración con UptimeRobot (hay otros equivalentes,
gratuitos):

| Monitor | Tipo    | URL                                                 | Comprobación               | Intervalo |
| ------- | ------- | --------------------------------------------------- | -------------------------- | --------- |
| API     | HTTP(s) | `https://api.forneapizzeria.es/api/v1/health/ready` | Responde 200 (503 = caído) | 5 min     |
| Web     | HTTP(s) | `https://forneapizzeria.es`                         | Responde 200               | 5 min     |

1. Crea la cuenta en [uptimerobot.com](https://uptimerobot.com) y, en _Integrations_, añade tu correo como
   contacto de alertas.
2. _Add New Monitor_ → tipo **HTTP(s)** para la API y para la web (la API devuelve 503 si la base de datos
   no responde). Intervalo de 5 minutos (el mínimo del plan gratuito; compruébalo en su web).
3. Prueba que avisa: pausa un monitor y comprueba que llega el correo de «down»/«up» al reanudarlo.
4. Si Supabase llegara a pausarse: panel de Supabase → _Restore project_ (los datos se conservan).

## Registros (logs)

- La API escribe **registros JSON** (una línea por petición, con un identificador `requestId` que
  también viaja en la cabecera `X-Request-Id`). No incluyen cabeceras ni cuerpos, y por tanto ni
  contraseñas, tokens ni datos de tarjeta.
- En Railway: pestaña de registros del servicio; filtra por `"level":50` (error) o `"level":40` (aviso).
- Al arrancar, las líneas `[config] …` indican configuración peligrosa (claves de prueba en
  producción, localhost en CORS, proxy sin configurar, administrador libre…). En producción no deben
  aparecer salvo que sea intencionado.
- Para investigar un fallo de un cliente: pídele la hora y busca el `requestId` que devuelve la API en
  los errores (`error.requestId`).
- Los errores de pago y los fallos de correo quedan además en la base de datos: el pago (`failureReason`)
  y el aviso (`lastError`, visible en el panel → Correos).

## Rutina

| Cuándo                               | Qué                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Cada día                             | Mirar pedidos pendientes y, si hay pagos online, que no haya pedidos «pendientes de pago» antiguos                             |
| Cada semana                          | Registro de errores de Railway; copia con `scripts/backup-produccion.ps1`; que el monitor siga en verde                        |
| Cada mes                             | Actualizaciones de seguridad de dependencias (`npm audit`, Dependabot si se activa) y revisión de usuarios con rol en el panel |
| Antes de un despliegue con migración | Copia manual de la base de datos                                                                                               |

## Despliegue de una versión nueva

1. Subir los cambios a `main` en GitHub. La integración continua ejecuta tipos, lint, formato y pruebas.
2. **Solo si pasa**, Vercel (web) y Railway (API) despliegan solos. Railway aplica las migraciones
   pendientes antes de arrancar la versión nueva.
3. Comprobar `/health/ready` y un pedido de prueba.

Una migración nueva debe poder convivir con la versión anterior del código durante el despliegue
(primero añadir, después usar, mucho después quitar).
