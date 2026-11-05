import type { SiteImage } from "@/types/media";

/**
 * IMÁGENES PROVISIONALES.
 *
 * Todas las rutas apuntan a `public/image/`. Para usar las fotografías definitivas basta con
 * sustituir los archivos (o cambiar aquí la ruta y las dimensiones). Un `alt` vacío indica que la
 * imagen es decorativa y no aporta información a los lectores de pantalla.
 */
export const IMAGES = {
  logo: {
    src: "/image/logo-forno.webp",
    width: 900,
    height: 612,
    alt: "FORNO Pizzeria",
  },
  heroPizza: {
    src: "/image/pizza-margherita-hero.webp",
    width: 1000,
    height: 624,
    alt: "Pizza Margherita recién salida del horno de leña",
  },
  pizzaMargheritaTabla: {
    src: "/image/pizza-margherita-tabla.webp",
    width: 900,
    height: 551,
    alt: "",
  },
  pizzaNapolitana: {
    src: "/image/pizza-napolitana.webp",
    width: 900,
    height: 554,
    alt: "",
  },
  pizzaEspecial: {
    src: "/image/pizza-especial.webp",
    width: 900,
    height: 675,
    alt: "",
  },
  pizzasMostrador: {
    src: "/image/pizzas-mostrador.webp",
    width: 1400,
    height: 933,
    alt: "",
  },
} as const satisfies Record<string, SiteImage>;
