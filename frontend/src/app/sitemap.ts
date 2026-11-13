import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

const ROUTES = ["", "/carta", "/promociones", "/fornea-club"] as const;

/** sitemap.xml con las páginas públicas indexables. */
export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((route) => ({ url: `${SITE_URL}${route}` }));
}
