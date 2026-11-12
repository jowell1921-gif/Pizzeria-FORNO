# 0013 — PizzAI con inteligencia artificial (Fase 9B, etapa 2)

Fecha: 2026-11-12

Segunda etapa de PizzAI (ver 0011): el chat puede responder con una IA real. **Sin clave de API sigue
exactamente igual que antes** (modo de demostración, respuestas provisionales y rotuladas).

| Tema                               | Decisión                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Proveedor y modelo                 | **Claude (Anthropic)** mediante su SDK oficial (`@anthropic-ai/sdk`), por defecto `claude-opus-5-5`; se cambia con `ASSISTANT_MODEL` (ver «Coste» más abajo). Detrás de la interfaz `AssistantModel`: otro proveedor se enchufa sin tocar el resto                                                                                                                                                                                                                                               |
| Dónde corre                        | Solo en el backend (`POST /api/v1/assistant/chat`). La clave `ANTHROPIC_API_KEY` vive solo en el servidor: nunca llega al navegador ni a Flutter                                                                                                                                                                                                                                                                                                                                                 |
| Activación                         | Con la clave configurada, el servidor lo anuncia en `GET /assistant/status` y la web usa la IA; sin ella, la web usa el modo de demostración. La web pregunta al abrir el chat por primera vez, no al cargar cada página                                                                                                                                                                                                                                                                         |
| Acceso a datos                     | **Controlado y de solo lectura**: la IA recibe un texto construido únicamente con los servicios públicos que ya alimentan la web (carta con precios, ingredientes, alérgenos y opciones; promociones y sus códigos públicos; zonas de reparto; horarios; ajustes del local; FORNO CLUB). **Nunca** clientes, pedidos, pagos, cupones personales ni datos internos (lo comprueba una prueba automática con datos privados de ejemplo). No tiene herramientas: no puede ejecutar ninguna operación |
| Respuestas basadas en datos reales | Las instrucciones obligan a responder solo con esos datos, a decir que no sabe lo que no figure y a remitir a la página o al teléfono del local; nunca inventar precios, horarios, ingredientes, alérgenos ni condiciones. Ante alergias, recomienda confirmarlo con el local                                                                                                                                                                                                                    |
| Instrucciones fijas                | Las reglas del asistente son fijas y se envían aparte; lo que escribe el cliente viaja solo como mensaje de usuario y se trata como dato, no como instrucción. Se rechaza el rol `system` y cualquier campo extra                                                                                                                                                                                                                                                                                |
| Límites (coste y abuso)            | Conversación de hasta 12 mensajes de 500 caracteres; 20 mensajes por IP cada 10 minutos; **tope diario global** (`ASSISTANT_DAILY_LIMIT`, por defecto 200) tras el cual responde 429 hasta el día siguiente (UTC); cada petición reserva su cupo antes de llamar al modelo, así que las simultáneas no lo superan; la petición se cancela si el visitante cierra la pestaña                                                                                                                      |
| Privacidad                         | No se guarda ninguna conversación. Los mensajes viajan al proveedor para generar la respuesta (hay que citarlo en la política de privacidad). El registro del servidor solo anota cifras de consumo (tokens), nunca el contenido. La web avisa de que no se escriban datos personales                                                                                                                                                                                                            |
| Transparencia                      | «Asistente con inteligencia artificial» en la cabecera, «Generado por IA: puede contener errores» en cada respuesta y aviso de comprobar precios y alérgenos en la carta                                                                                                                                                                                                                                                                                                                         |
| Fallos                             | Errores del proveedor, saturación o cuota → mensajes genéricos en español (502 `ASSISTANT_ERROR`, 503 `ASSISTANT_BUSY`); nunca se filtran detalles del proveedor. Si los clasificadores de seguridad del proveedor declinan, la API reintenta sola con otro modelo (`fallbacks`) y, si también declina, se responde con un texto fijo                                                                                                                                                            |
| Parámetros del modelo              | Esfuerzo `low` (charla sobre una carta; menos coste y latencia), `max_tokens` 2000 (el razonamiento interno cuenta dentro), prefijo estable (instrucciones + datos) con caché de prompt, sin `temperature`/`top_p` ni `tool_choice` (los rechazan los modelos actuales) y sin leer nunca los bloques de razonamiento                                                                                                                                                                             |
| Enlaces                            | Los decide el servidor según el tema (`/carta`, `/promociones`, `/forno-club`), no el modelo                                                                                                                                                                                                                                                                                                                                                                                                     |

## Coste

Es la parte que debe decidir el propietario. Cada mensaje envía las instrucciones y los datos del
negocio (unos pocos miles de tokens, con caché de prompt) más la conversación. Orientativamente, con
los precios publicados del proveedor (octubre de 2026): `claude-opus-5-5` 4 $/20 $ por millón de
tokens de entrada/salida → del orden de **1-3 céntimos por mensaje**; `claude-haiku-5-5` 0,10 $/0,50 $
→ **décimas de céntimo por mensaje**. Con el tope por defecto de 200 mensajes al día, el gasto máximo
diario es de unos pocos dólares con el modelo grande y céntimos con el pequeño. Para una demostración
de carta basta el modelo pequeño: ponlo con `ASSISTANT_MODEL=claude-haiku-5-5` (sin respaldo de
modelo alternativo si declina). **Revisa los precios actuales en la consola del proveedor** y fija un
límite de gasto mensual allí; la API de Anthropic solo cobra cuando se usa una clave.

## Cómo activarlo

1. Crea una clave de API en la consola de Anthropic (con límite de gasto) y ponla **solo** en `backend/.env` (o en Railway): `ANTHROPIC_API_KEY=...`. No la pegues en el chat ni en Git.
2. Opcional: `ASSISTANT_MODEL` y `ASSISTANT_DAILY_LIMIT`.
3. Reinicia el backend: debe decir `Assistant: AI (modelo, N/day)`.
4. Abre el chat de la web: la cabecera pone «Asistente con inteligencia artificial».

## Verificación

Las pruebas automáticas cubren: la forma exacta de la petición al proveedor (con un cliente falso),
que la IA solo recibe datos públicos y reales, que ningún dato privado se cuela, el tratamiento del
texto del cliente como dato, la validación de la entrada, los límites diario y por IP (también con
peticiones simultáneas), los fallos del proveedor sin filtraciones, la cancelación al cerrar la
conexión y, en la web, el cambio entre IA y demostración. **No se ha podido probar contra el
proveedor real porque no hay una clave de API configurada**; la primera prueba real debe hacerse al
activarla (preguntar por la carta y por algo que no figure en ella, e intentar sacarla del tema).

## Pendiente

- Probar con la clave real y revisar la calidad de las respuestas con preguntas reales.
- Citar al proveedor de IA en la política de privacidad (ver `docs/security/lista-produccion.md`).
- Si se despliega en varias réplicas, el tope diario (en memoria) debería pasar a la base de datos o a Redis.

## Proveedores y coste mensual

PizzAI admite dos proveedores detrás de la misma interfaz (`AssistantModel`). Si están las dos claves, se usa Gemini.

| Proveedor | Variables                                             | Uso recomendado                                                                                                                                                               |
| --------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gemini    | `GEMINI_API_KEY`, `GEMINI_MODEL` (`gemini-3.1-flash-lite,gemini-flash-lite-latest`) | Demostraciones y pruebas: tiene nivel gratuito con límites bajos que Google puede cambiar. Google puede usar las conversaciones del nivel gratuito para mejorar sus productos |
| Claude    | `ANTHROPIC_API_KEY`, `ASSISTANT_MODEL`                | Producción de un cliente: de pago, con `claude-haiku-5-5` basta para una carta                                                                                                |

Estimación del coste con Claude Haiku 5.5 (0,10 $ por millón de tokens de entrada y 0,50 $ de salida; unos
2.400 tokens de entrada y 500 de salida por mensaje, ≈ 0,0005 $ por mensaje; la caché lo reduce):

| Mensajes al mes | Coste aproximado |
| --------------- | ---------------- |
| 1.000           | 0,50 $           |
| 5.000           | 2,50 $           |
| 10.000          | 5 $              |
| 50.000          | 25 $             |

Es una estimación, no una factura: los precios los fija el proveedor y deben comprobarse antes de
ofrecerlos a un cliente. `ASSISTANT_DAILY_LIMIT` acota el gasto máximo.
