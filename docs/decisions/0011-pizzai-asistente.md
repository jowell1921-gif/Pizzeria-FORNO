# 0011 — PizzAI, asistente virtual (Fase 8C, etapa 1)

Fecha: 2026-11-11

Primera etapa de PizzAI: **solo interfaz y experiencia visual**. No hay ninguna inteligencia artificial conectada.

| Tema                      | Decisión                                                                                                                                                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alcance                   | Personaje animado flotante, ventana de chat, sugerencias y respuestas de demostración. No accede a pedidos, pagos, autenticación ni base de datos                                                                                                  |
| Honestidad                | La cabecera dice «Modo demostración», cada respuesta lleva «Respuesta de demostración (provisional)» y el pie avisa de que aún no usa IA. Las respuestas no contienen precios, horarios ni condiciones: llevan a la página con la información real |
| Dónde aparece             | En toda la web pública (capa `(public)`), salvo en `/pedido` (el pago). Nunca en el panel del personal. Va por debajo de los modales (`z-40`) y respeta las zonas seguras del móvil                                                                |
| Personaje                 | SVG propio con los colores de marca (sin imágenes ni dependencias). Flotación, giro al pasar el cursor, parpadeo y un saludo ocasional con el chat cerrado y la pestaña visible; nada de esto ocurre con «reducir movimiento»                      |
| Accesibilidad             | Botón con nombre accesible, chat como diálogo no modal, Escape cierra, el foco va al campo al abrir y vuelve al personaje al cerrar, conversación en `aria-live`, objetivos táctiles de 44 px. El texto del usuario se muestra siempre como texto  |
| Historial                 | Solo en memoria: al recargar, la conversación empieza de cero                                                                                                                                                                                      |
| Preparado para la IA real | La interfaz solo conoce `AssistantClient` (`send(historial, texto, señal)`). La etapa 2 aportará otro cliente que llame al backend, sin cambiar los componentes                                                                                    |

## Etapa 2 (no implementada)

Requiere autorización expresa, elegir proveedor de IA y una clave de API (solo en el backend), un endpoint propio con límites de uso, acceso controlado a la carta y la información del local, y revisión en la fase de QA.
