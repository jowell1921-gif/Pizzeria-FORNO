import Image from "next/image";
import Link from "next/link";

import { IMAGES } from "@/lib/images";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  /**
   * `image`: logotipo completo (para fondos claros).
   * `wordmark`: texto «FORNEA», para fondos oscuros donde el logotipo no tiene contraste.
   */
  variant?: "image" | "wordmark";
}

export function Logo({ className, variant = "image" }: LogoProps) {
  return (
    <Link
      href="/"
      transitionTypes={["nav-back"]}
      aria-label="FORNEA, ir al inicio"
      className={cn("inline-flex items-center", className)}
    >
      {variant === "image" ? (
        <Image
          src={IMAGES.logo.src}
          width={IMAGES.logo.width}
          height={IMAGES.logo.height}
          alt=""
          priority
          sizes="(min-width: 768px) 96px, 72px"
          className="h-11 w-auto md:h-14"
        />
      ) : (
        <span className="font-heading text-cream inline-flex items-center gap-2 text-3xl leading-none font-extrabold tracking-wide uppercase">
          <span aria-hidden className="bg-tomato inline-block size-3 rounded-full" />
          FORNEA
        </span>
      )}
    </Link>
  );
}
