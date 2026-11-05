import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageTransition } from "@/components/layout/page-transition";
import { SectionHeading } from "@/components/layout/section-heading";
import { LEGAL_PAGES } from "@/lib/site";

export function generateStaticParams() {
  return LEGAL_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: PageProps<"/legal/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = LEGAL_PAGES.find((item) => item.slug === slug);
  return page ? { title: page.title, robots: { index: false } } : {};
}

const REQUIRED_DATA = [
  "Razón social o nombre del titular",
  "NIF/CIF",
  "Domicilio social",
  "Correo electrónico y teléfono de contacto",
  "Datos de inscripción en el Registro Mercantil, si procede",
] as const;

export default async function LegalPage({ params }: PageProps<"/legal/[slug]">) {
  const { slug } = await params;
  const page = LEGAL_PAGES.find((item) => item.slug === slug);
  if (!page) notFound();

  return (
    <PageTransition className="container-page section-y max-w-3xl space-y-6">
      <SectionHeading as="h1" eyebrow="Información legal" title={page.title} />
      <div
        role="note"
        className="border-tomato-strong bg-cream-soft space-y-3 rounded-xl border-l-4 p-5 text-sm"
      >
        <p className="font-semibold">[PENDIENTE] Texto legal por redactar</p>
        <p>
          Este texto es un marcador de posición. No constituye un texto legal definitivo ni
          garantiza el cumplimiento normativo (RGPD, LOPDGDD, LSSI-CE). Debe redactarlo o revisarlo
          un profesional con los datos reales del titular del negocio.
        </p>
        <p className="font-semibold">Datos que debe aportar el titular:</p>
        <ul className="list-disc space-y-1 pl-5">
          {REQUIRED_DATA.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </PageTransition>
  );
}
