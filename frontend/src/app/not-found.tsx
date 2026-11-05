import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container-page flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
      <p className="text-tomato-deep text-sm font-bold tracking-widest uppercase">Error 404</p>
      <h1 className="text-5xl font-extrabold">Página no encontrada</h1>
      <p className="text-muted-foreground max-w-md">
        La página que buscas no existe o ha cambiado de lugar.
      </p>
      <Link href="/" className={buttonVariants({ size: "lg" })}>
        Volver al inicio
      </Link>
    </div>
  );
}
