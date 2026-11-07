import type { ReactNode } from "react";

import { PageTransition } from "@/components/layout/page-transition";
import { SectionHeading } from "@/components/layout/section-heading";

import { AuthPerksStrip, AuthShowcase } from "./auth-showcase";

interface AuthShellProps {
  title: string;
  description?: string;
  children: ReactNode;
}

/**
 * Marco común de las páginas de acceso: el formulario en una tarjeta y, en pantallas grandes, un
 * panel animado con las ventajas de tener cuenta al lado.
 */
export function AuthShell({ title, description, children }: AuthShellProps) {
  return (
    <PageTransition className="container-page section-y">
      <div className="mx-auto grid w-full max-w-md items-stretch gap-8 lg:max-w-5xl lg:grid-cols-2 lg:gap-10">
        <AuthShowcase />
        <div className="space-y-6 self-center">
          <AuthPerksStrip />
          <SectionHeading as="h1" title={title} description={description} />
          <div className="border-border bg-card space-y-6 rounded-2xl border p-6 shadow-sm sm:p-8">
            {children}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
