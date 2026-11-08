/** Aviso cuando la API no responde: la página sigue siendo usable y se puede recargar. */
export function CatalogUnavailable({ what }: { what: string }) {
  return (
    <p
      role="status"
      className="border-border bg-cream-soft rounded-xl border border-dashed p-4 text-sm"
    >
      No hemos podido cargar {what} ahora mismo. Recarga la página en unos instantes.
    </p>
  );
}

/** Marcador de posición mientras llegan los datos. */
export function CatalogSkeleton({ className = "h-64" }: { className?: string }) {
  return <div aria-hidden className={`bg-muted/60 animate-pulse rounded-2xl ${className}`} />;
}
