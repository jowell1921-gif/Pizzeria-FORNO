import type { ReactNode } from "react";

import { LEGAL_UPDATED } from "@/lib/legal";

/** Piezas de maquetación comunes a los textos legales. */
export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-2xl leading-tight font-bold">{title}</h2>
      {children}
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed">{children}</p>;
}

export function List({ items }: { items: readonly ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

export function LegalDocument({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-8">
      <p className="text-muted-foreground text-xs">Última actualización: {LEGAL_UPDATED}</p>
      {children}
    </div>
  );
}

/**
 * Tabla sencilla (proveedores, cookies…). En pantallas pequeñas cada fila se apila como una ficha, con
 * el nombre de la columna encima de cada dato, para no obligar a desplazarse en horizontal. Los roles
 * conservan la semántica de tabla aunque el CSS cambie la presentación.
 */
export function LegalTable({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: readonly string[];
  rows: readonly (readonly ReactNode[])[];
}) {
  return (
    <div className="border-border overflow-hidden rounded-xl border">
      <table role="table" className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead role="rowgroup" className="hidden md:table-header-group">
          <tr role="row" className="bg-cream-soft md:table-row">
            {head.map((cell) => (
              <th role="columnheader" key={cell} scope="col" className="px-4 py-2.5 font-semibold">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup" className="block md:table-row-group">
          {rows.map((row, index) => (
            <tr
              role="row"
              key={index}
              className="border-border block border-b align-top last:border-b-0 md:table-row"
            >
              {row.map((cell, cellIndex) => (
                <td
                  role="cell"
                  key={cellIndex}
                  data-label={head[cellIndex]}
                  className="before:text-muted-foreground block px-4 py-1.5 [overflow-wrap:anywhere] before:block before:text-xs before:font-semibold before:content-[attr(data-label)] first:pt-3 last:pb-3 md:table-cell md:py-2.5 md:before:hidden md:first:pt-2.5 md:last:pb-2.5"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
