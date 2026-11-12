import type { SiteImage } from "@/types/media";

/**
 * IMÁGENES PROVISIONALES.
 *
 * Todas las rutas apuntan a `public/image/`. Para usar las fotografías definitivas basta con
 * sustituir los archivos (o cambiar aquí la ruta y las dimensiones). Un `alt` vacío indica que la
 * imagen es decorativa y no aporta información a los lectores de pantalla.
 *
 * Las fotos de los productos de la carta no se listan aquí: su ruta está en la base de datos
 * (tabla `ProductImage`, ver `backend/prisma/seed-demo-data.ts`) y la sirve la API.
 * Los originales sin procesar se guardan en `frontend/assets-originals/` (fuera de Git).
 */
export const IMAGES = {
  logo: {
    // «?v=N»: súbelo al cambiar el archivo, para que el navegador y Next no sirvan la copia antigua.
    src: "/image/logo-fornea.webp?v=2",
    width: 1451,
    height: 1084,
    alt: "FORNEA Pizzeria",
  },
  heroPizza: {
    src: "/image/pizza-margherita-hero.webp",
    width: 1000,
    height: 624,
    alt: "Pizza Margherita recién salida del horno de leña",
  },
  /** Pizza sin fondo de la cabecera de «Nuestra carta». */
  cartaBanner: {
    src: "/image/carta-banner.webp",
    width: 1000,
    height: 562,
    alt: "",
  },
} as const satisfies Record<string, SiteImage>;
