import type { Metadata } from "next";

import { PageTransition } from "@/components/layout/page-transition";
import { Benefits } from "@/features/home/benefits";
import { ClubTeaser } from "@/features/home/club-teaser";
import { FeaturedPromotions } from "@/features/home/featured-promotions";
import { Hero } from "@/features/home/hero";
import { PopularProducts } from "@/features/home/popular-products";
import { Stats } from "@/features/home/stats";
import { StoreInfo } from "@/features/home/store-info";
import { DEMO_STORE } from "@/lib/demo-data";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "FORNEA · Pizzería con pedidos online" },
  alternates: { canonical: "/" },
};

const restaurantJsonLd = {
  "@context": "https://schema.org",
  "@type": "Restaurant",
  name: DEMO_STORE.name,
  description: DEMO_STORE.tagline,
  url: SITE_URL,
  telephone: DEMO_STORE.phone,
  servesCuisine: "Pizza",
  address: { "@type": "PostalAddress", streetAddress: DEMO_STORE.address, addressCountry: "ES" },
};

export default function HomePage() {
  return (
    <PageTransition>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(restaurantJsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <Hero />
      <Stats />
      <PopularProducts />
      <FeaturedPromotions />
      <ClubTeaser />
      <Benefits />
      <StoreInfo />
    </PageTransition>
  );
}
