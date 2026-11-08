"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChefHat, ClipboardList, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { SignOutButton } from "@/features/account/sign-out-button";
import { ProfileProvider, useProfile } from "@/features/account/profile-context";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  permission: string;
  icon: typeof LayoutDashboard;
}

const NAV: NavItem[] = [
  { href: "/admin", label: "Panel", permission: "dashboard:read", icon: LayoutDashboard },
  { href: "/admin/pedidos", label: "Pedidos", permission: "orders:read:all", icon: ClipboardList },
  { href: "/kitchen", label: "Cocina", permission: "kitchen:orders:read", icon: ChefHat },
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { auth, profile, profileStatus } = useProfile();

  const allowed = NAV.filter((item) => profile?.permissions.includes(item.permission));

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <header className="bg-charcoal text-cream border-cream/10 sticky top-0 z-40 border-b">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Logo variant="wordmark" />
          <span className="text-gold text-xs font-bold tracking-widest uppercase">Personal</span>
          <nav
            aria-label="Navegación del panel"
            className="order-last -mx-1 flex w-full gap-1 overflow-x-auto sm:order-none sm:mx-0 sm:w-auto"
          >
            {allowed.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold whitespace-nowrap",
                  isActive(pathname, item.href)
                    ? "bg-cream text-charcoal"
                    : "text-cream hover:bg-cream/10",
                )}
              >
                <item.icon aria-hidden className="size-4" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "border-cream/40 text-cream hover:bg-cream/10 hover:text-cream bg-transparent",
              )}
            >
              Ver la web
            </Link>
            <SignOutButton className="border-cream/40 text-cream hover:bg-cream/10 hover:text-cream bg-transparent" />
          </div>
        </div>
      </header>

      <main id="contenido" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {auth.status === "loading" ||
        (auth.status === "authenticated" && profileStatus === "loading") ? (
          <p className="text-muted-foreground">Cargando…</p>
        ) : auth.status === "anonymous" ? (
          <div className="space-y-4">
            <p>Necesitas iniciar sesión para entrar al panel.</p>
            <Link href="/acceso?next=/admin" className={buttonVariants({ size: "lg" })}>
              Iniciar sesión
            </Link>
          </div>
        ) : !profile || allowed.length === 0 ? (
          <div role="alert" className="border-border space-y-2 rounded-2xl border p-6">
            <h1 className="text-3xl font-bold">Acceso restringido</h1>
            <p className="text-muted-foreground">
              Tu cuenta no tiene permisos para esta zona. Si deberías tenerlos, pídele a un
              administrador que te asigne un rol.
            </p>
            <Link href="/" className={buttonVariants({ variant: "outline" })}>
              Volver a la web
            </Link>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}

/** Proveedores y marco de la zona privada. La seguridad real la aplica el backend en cada petición. */
export function PanelShell({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <ProfileProvider>
      <QueryClientProvider client={client}>
        {/* El marco lee la ruta actual: en rutas con parámetros debe ir en Suspense. */}
        <Suspense fallback={<p className="text-muted-foreground p-6">Cargando…</p>}>
          <Frame>{children}</Frame>
        </Suspense>
      </QueryClientProvider>
    </ProfileProvider>
  );
}

/** Muestra su contenido solo si el usuario tiene el permiso (la interfaz se adapta; el backend decide). */
export function RequirePermission({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const { profile } = useProfile();
  if (!profile) return null;
  if (!profile.permissions.includes(permission)) {
    return (
      <div role="alert" className="border-border space-y-2 rounded-2xl border p-6">
        <h1 className="text-3xl font-bold">Sin permiso</h1>
        <p className="text-muted-foreground">Tu rol no incluye esta pantalla.</p>
      </div>
    );
  }
  return <>{children}</>;
}
