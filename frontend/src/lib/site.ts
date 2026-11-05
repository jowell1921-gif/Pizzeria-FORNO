export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const MAIN_NAV = [
  { href: "/carta", label: "Carta" },
  { href: "/promociones", label: "Promociones" },
  { href: "/forno-club", label: "FORNO CLUB" },
  { href: "/#ubicacion", label: "Dónde estamos" },
] as const;

export const LEGAL_PAGES = [
  { slug: "aviso-legal", title: "Aviso legal" },
  { slug: "privacidad", title: "Política de privacidad" },
  { slug: "cookies", title: "Política de cookies" },
  { slug: "condiciones-de-compra", title: "Condiciones de compra" },
] as const;
