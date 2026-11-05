import { Logo } from "@/components/brand/logo";
import { MainNav } from "@/components/layout/main-nav";

export function SiteHeader() {
  return (
    <header
      style={{ viewTransitionName: "site-header" }}
      className="border-border bg-background/95 sticky top-0 z-40 border-b backdrop-blur"
    >
      <div className="container-page flex h-16 items-center justify-between gap-4 md:h-20">
        <Logo />
        <MainNav />
      </div>
    </header>
  );
}
