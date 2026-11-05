import type { Metadata } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";

import { SITE_URL } from "@/lib/site";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "FORNO · Pizzería con pedidos online",
    template: "%s · FORNO",
  },
  description:
    "Pide online las pizzas de FORNO para recoger o a domicilio y acumula puntos con FORNO CLUB. Sitio de demostración.",
  openGraph: {
    type: "website",
    locale: "es_ES",
    siteName: "FORNO",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${inter.variable} ${barlowCondensed.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
