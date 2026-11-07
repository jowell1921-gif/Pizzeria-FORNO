import Image from "next/image";
import Link from "next/link";

import { AmbientParticles } from "@/components/brand/ambient-particles";
import { FornoWatermark } from "@/components/brand/forno-watermark";
import { buttonVariants } from "@/components/ui/button";
import { DEMO_STORE } from "@/lib/demo-data";
import { IMAGES } from "@/lib/images";
import { cn } from "@/lib/utils";

const FORWARD = ["nav-forward"];

/**
 * Hero con capas de profundidad: marca de agua, halo, pizza y texto se mueven a distinta
 * velocidad con el scroll (ver «Profundidad del hero» en globals.css).
 */
export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="bg-charcoal text-cream relative isolate overflow-hidden"
    >
      <AmbientParticles />
      <FornoWatermark className="hero-watermark top-1/2 -translate-y-1/2" />

      <div className="container-page grid items-center gap-8 py-12 sm:py-16 lg:grid-cols-2 lg:py-24">
        <div className="hero-copy space-y-6">
          <p className="text-gold text-sm font-bold tracking-widest uppercase">
            Pizzería · Recogida y domicilio
          </p>
          <h1
            id="hero-title"
            className="text-6xl leading-[0.9] font-extrabold sm:text-7xl lg:text-8xl"
          >
            Pizza de horno de leña, <span className="text-tomato">cuando quieras</span>
          </h1>
          <p className="text-cream/85 max-w-xl text-lg">
            {DEMO_STORE.tagline}. Pide online, elige recogida o entrega a domicilio y suma puntos en
            cada pedido con FORNO CLUB.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/carta"
              transitionTypes={FORWARD}
              className={cn(buttonVariants({ size: "lg" }), "tracking-wide uppercase")}
            >
              Pedir ahora
            </Link>
            <Link
              href="/carta"
              transitionTypes={FORWARD}
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "border-cream/40 text-cream hover:bg-cream/10 hover:text-cream bg-transparent",
              )}
            >
              Ver la carta
            </Link>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-xs sm:max-w-sm lg:max-w-md">
          <div
            aria-hidden
            className="hero-glow pointer-events-none absolute -inset-[25%] -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(217,74,50,0.5),rgba(214,168,75,0.16)_58%,transparent)]"
          />
          <div className="hero-enter">
            <div className="hero-depth">
              <div className="hero-float">
                <Image
                  src={IMAGES.heroPizza.src}
                  width={IMAGES.heroPizza.width}
                  height={IMAGES.heroPizza.height}
                  alt={IMAGES.heroPizza.alt}
                  priority
                  sizes="(min-width: 1024px) 448px, (min-width: 640px) 384px, 320px"
                  className="h-auto w-full drop-shadow-2xl"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
