import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageTransition } from "@/components/layout/page-transition";
import { SectionHeading } from "@/components/layout/section-heading";
import { AvisoLegal } from "@/features/legal/aviso-legal";
import { CondicionesDeCompra } from "@/features/legal/condiciones-de-compra";
import { Cookies } from "@/features/legal/cookies";
import { Privacidad } from "@/features/legal/privacidad";
import { LEGAL_PAGES } from "@/lib/site";

const DOCUMENTS = {
  "aviso-legal": AvisoLegal,
  privacidad: Privacidad,
  cookies: Cookies,
  "condiciones-de-compra": CondicionesDeCompra,
} as const;

export function generateStaticParams() {
  return LEGAL_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: PageProps<"/legal/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = LEGAL_PAGES.find((item) => item.slug === slug);
  return page ? { title: page.title } : {};
}

/**
 * Textos legales (aviso, privacidad, cookies y condiciones). El contenido está en features/legal y
 * los datos del titular, en lib/legal.ts.
 */
export default async function LegalPage({ params }: PageProps<"/legal/[slug]">) {
  const { slug } = await params;
  const page = LEGAL_PAGES.find((item) => item.slug === slug);
  if (!page) notFound();
  const Document = DOCUMENTS[page.slug];

  return (
    <PageTransition className="container-page section-y max-w-3xl space-y-6">
      <SectionHeading as="h1" eyebrow="Información legal" title={page.title} />
      <Document />
    </PageTransition>
  );
}
