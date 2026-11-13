import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

/**
 * robots.txt: permite el rastreo de las páginas públicas y excluye el panel, la cocina y las zonas
 * con sesión.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/kitchen", "/cuenta", "/pedido", "/auth"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
