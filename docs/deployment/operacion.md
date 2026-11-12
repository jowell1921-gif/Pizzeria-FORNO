# Operación: monitorización, registros y rutina

## Comprobaciones de salud

| URL                        | Para qué                                                                  | Quién la usa                                                |
| -------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `GET /api/v1/health`       | Vivacidad: el proceso responde (no toca la base de datos)                 | Railway (`healthcheckPath`): si falla, reinicia el servicio |
| `GET /api/v1/health/ready` | Disponibilidad: además, la base de datos responde (`503 NOT_READY` si no) | Un monitor externo de disponibilidad                        |

No uses `/health/ready` como comprobación de reinicio: un corte breve de la base de datos
reiniciaría el servicio sin arreglar nada.

**Monitor de disponibilidad.** Crea uno (por ejemplo, UptimeRobot, Better Stack o el de tu
proveedor; los hay gratuitos) que consulte `https://api.forno.ejemplo/api/v1/health/ready` cada
1-5 minutos y avise por correo o móvil, y otro sobre la portada de la web.

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
| Cada semana                          | Registro de errores de Railway; panel → Auditoría; copia manual de la base de datos                                            |
| Cada mes                             | Actualizaciones de seguridad de dependencias (`npm audit`, Dependabot si se activa) y revisión de usuarios con rol en el panel |
| Antes de un despliegue con migración | Copia manual de la base de datos                                                                                               |

## Despliegue de una versión nueva

1. Subir los cambios a `main` en GitHub. La integración continua ejecuta tipos, lint, formato y pruebas.
2. **Solo si pasa**, Vercel (web) y Railway (API) despliegan solos. Railway aplica las migraciones
   pendientes antes de arrancar la versión nueva.
3. Comprobar `/health/ready` y un pedido de prueba.

Una migración nueva debe poder convivir con la versión anterior del código durante el despliegue
(primero añadir, después usar, mucho después quitar).
