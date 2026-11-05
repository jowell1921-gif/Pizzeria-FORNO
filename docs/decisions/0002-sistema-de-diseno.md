# 0002 — Sistema de diseño y páginas públicas (Fase 2)

Fecha: 2026-11-05

## Paleta y accesibilidad

La paleta de marca se mantiene (tomate `#D94A32`, carbón `#171717`, crema `#F5E6C8`, dorado `#D6A84B`, blanco), pero el tomate de marca **no alcanza el contraste AA** con texto blanco (4,22:1; se exige 4,5:1). Por eso:

| Uso                                                          | Color                                     |
| ------------------------------------------------------------ | ----------------------------------------- |
| Fondos decorativos, iconos, titulares grandes sobre carbón   | `--tomato` `#D94A32`                      |
| Botones y texto pequeño sobre blanco (blanco encima: 5,30:1) | `--tomato-strong` `#BF3F2A`               |
| Texto pequeño sobre crema                                    | `--tomato-deep` `#A53320`                 |
| Texto secundario                                             | `--ink-muted` `#5C5148`                   |
| Dorado                                                       | solo sobre carbón (sobre blanco da 2,2:1) |

`tests/design-tokens.test.ts` comprueba estos contrastes leyendo `globals.css`, de modo que un cambio de color que rompa AA falle en las pruebas.

## Componentes

- **shadcn/ui** (estilo Base UI) con los componentes `button`, `sheet`, `badge` y `accordion`. Solo se añaden los que se usan.
- `buttonVariants` se ha envuelto para fusionar clases en conflicto; así los enlaces con aspecto de botón (`<Link className={buttonVariants(...)}>`) respetan las variantes.
- Los botones miden al menos 40 px de alto (48 px en tamaño grande) y los iconos 44 px, por usabilidad táctil.
- Server Components por defecto. Solo `main-nav.tsx` es Client Component (menú móvil y estado activo).
- `cacheComponents` está activo en Next 16; el pie de página usa `"use cache"` por mostrar el año actual.

## Datos de demostración

Los datos viven en `src/lib/demo-data.ts`, marcados como demostración, y el sitio muestra un aviso permanente. Se sustituirán por la API en las fases 5 y 6. Los importes son cadenas decimales; `formatEuro` solo da formato de presentación y nunca calcula precios.

## Animaciones

Definidas en `globals.css`, solo con CSS (sin JavaScript ni librerías):

| Clase                                                        | Efecto                                                                                                                                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.hero-enter` + `.hero-float`                                | La pizza del hero entra con un giro suave y después flota ±10 px de arriba abajo (ciclo de 6 s)                                                                                             |
| `.scroll-image`                                              | La imagen se «dibuja» al hacer scroll: pasa de transparente, sin color y desenfocada a su color final, revelándose desde abajo                                                              |
| `.scroll-reveal`                                             | Las tarjetas aparecen con un desplazamiento hacia arriba mientras se hace scroll                                                                                                            |
| `.hero-depth`, `.hero-copy`, `.hero-watermark`, `.hero-glow` | Profundidad del hero: durante los primeros 70vh de scroll, la pizza baja, crece y gira; el texto sube y se atenúa; la marca de agua «FORNO» y el halo se mueven a otra velocidad (parallax) |
| `.counter` + `AnimatedNumber`                                | Los números de la franja de cifras suben de 0 a su valor mientras se hace scroll. El valor real siempre está en el HTML                                                                     |
| `.card-interactive`                                          | Las tarjetas se elevan y la foto hace zoom al pasar el ratón (solo en dispositivos con hover)                                                                                               |

- Usan animaciones guiadas por scroll de CSS (`animation-timeline: view()`), protegidas con `@supports`: los navegadores que no las soportan muestran el contenido sin animar, nunca oculto.
- Todo está dentro de `prefers-reduced-motion: no-preference`: con «reducir movimiento» no hay animaciones y todas las imágenes se ven completas.
- Las pruebas E2E se ejecutan en modo «reducir movimiento» (estado estático, estable para axe), y `animations.spec.ts` comprueba la flotación, el dibujado progresivo y el modo sin movimiento.
- Pendiente de comprobar: el comportamiento en Firefox y Safari (solo se ha probado Chromium).

### Transiciones entre páginas

Se usa `<ViewTransition>` de React 19.3 (con la API View Transitions del navegador), que en Next.js 16 funciona sin configuración. Ver la guía `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`.

- `components/layout/page-transition.tsx` envuelve el contenido de cada `page.tsx` (no el layout, que persiste y no ejecuta animaciones de entrada ni de salida).
- Los enlaces llevan `transitionTypes`: `nav-forward` (navegación, botones y pie) y `nav-back` (logotipo). El contenido se desliza ±80 px con un desenfoque, según la dirección.
- La cabecera tiene `view-transition-name: site-header` y no se anima, para que sirva de ancla visual.
- Las navegaciones sin tipo (botón «atrás» del navegador) no se animan. Con «reducir movimiento» las duraciones son 0.
- Los navegadores sin soporte navegan con normalidad, sin animación.
- Las franjas de cifras usan datos de la configuración y la carta (tiempos, número de productos disponibles y puntos de la recompensa más barata), no cifras inventadas.

## Imágenes

Las imágenes actuales son **provisionales** y se declaran en un único archivo, `src/lib/images.ts`; para sustituirlas basta con cambiar los archivos de `public/image/` (o la ruta y las dimensiones en ese mapa). Los productos sin fotografía muestran una ilustración SVG (`PizzaIllustration`).

- Se versionan solo las versiones optimizadas en WebP (`frontend/public/image/`, ≈1 MB en total). Los originales (PNG/JPG de 3–5 MB) se guardan fuera de `public/`, en `frontend/assets-originals/`, que está en `.gitignore`.
- Cuatro de las imágenes recibidas (el logotipo y tres pizzas) tenían el tablero de «transparencia» pintado en los píxeles, sin canal alfa. Se recortó el fondo por código y se comprobó visualmente; el resultado es válido para esta fase, pero conviene pedir las versiones originales con transparencia real o vectoriales (SVG) para producción.
- El logotipo tiene letras oscuras, así que solo se usa sobre fondos claros (cabecera). En el pie, sobre carbón, se usa el texto «FORNO».
- **Pendiente:** aportar fotografías definitivas con licencia y confirmar derechos de uso del logotipo.

## Páginas legales

`/legal/[slug]` muestra un marcador `[PENDIENTE]` con la lista de datos que debe aportar el titular. No contiene textos legales definitivos.

## Pruebas de la fase

- Vitest: contrastes de la paleta, formato de importes, tarjeta de producto, página de inicio y codificación de archivos (sin BOM ni texto corrupto).
- Playwright con Chromium en 4 resoluciones (320, 390, 820 y 1366 px): un único `h1`, sin desbordamiento horizontal, sin errores de consola, navegación, menú móvil, enlace «Saltar al contenido», 404 y axe con etiquetas WCAG 2.0, 2.1 y 2.2 AA.
- Pendiente de comprobar: Firefox y WebKit (solo se ha probado Chromium), lector de pantalla real y rendimiento en red móvil (Lighthouse).
