"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useId, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useProfile } from "@/features/account/profile-context";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export const fieldClass =
  "border-border bg-background h-11 w-full rounded-lg border px-3 text-sm disabled:opacity-60";

const MESSAGES: Record<string, string> = {
  FORBIDDEN: "No tienes permiso para hacer esto.",
  NETWORK_ERROR: "No se pudo conectar con el servidor.",
  VALIDATION_ERROR: "Revisa los datos: alguno no es válido.",
  CATEGORY_HAS_PRODUCTS: "No se puede borrar: la categoría todavía tiene productos.",
  UNKNOWN_ALLERGEN: "Alguno de los alérgenos no existe.",
  INVALID_OPTION_GROUP: "Revisa los grupos de opciones (mínimos, máximos y opción por defecto).",
  INVALID_OPTION: "Alguna opción no es válida.",
  NO_ORDER_TYPE: "Debe quedar activa al menos la recogida o el reparto.",
  SPECIAL_DAY_EXISTS: "Ya hay un día especial en esa fecha.",
  POSTAL_CODE_IN_USE: "Algún código postal ya pertenece a otra zona.",
  COUPON_CODE_EXISTS: "Ya existe un cupón con ese código.",
  COUPON_HAS_USES: "Ese cupón ya se ha usado: desactívalo en lugar de borrarlo.",
  CUSTOMER_NOT_FOUND: "No existe ese cliente.",
  STORAGE_NOT_CONFIGURED:
    "La subida de fotos aún no está configurada. Indica la ruta o URL de la imagen.",
  INVALID_IMAGE: "La imagen no es válida (solo JPEG, PNG o WebP).",
  IMAGE_TOO_LARGE: "La imagen pesa demasiado (máximo 3 MB).",
  INSUFFICIENT_POINTS: "El cliente no tiene puntos suficientes para ese ajuste.",
};

export function adminErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return MESSAGES[error.code] ?? "No se ha podido completar la acción. Inténtalo de nuevo.";
  }
  return "No se ha podido completar la acción. Inténtalo de nuevo.";
}

/** Lectura de un recurso de administración con su clave de caché. */
export function useAdminQuery<T>(
  key: QueryKey,
  load: (token: string) => Promise<T>,
): UseQueryResult<T> {
  const { token } = useProfile();
  return useQuery({
    queryKey: ["admin-data", ...key],
    queryFn: () => load(token ?? ""),
    enabled: token !== null,
  });
}

/** Escritura: tras guardar, vuelve a leer los recursos que empiezan por `invalidate`. */
export function useAdminMutation<Input, Output>(
  run: (token: string, input: Input) => Promise<Output>,
  invalidate: string,
  onDone?: (output: Output) => void,
) {
  const { token } = useProfile();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Input) => run(token ?? "", input),
    onSuccess: async (output) => {
      await client.invalidateQueries({ queryKey: ["admin-data", invalidate] });
      onDone?.(output);
    },
  });
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-5xl leading-none font-extrabold uppercase">{children}</h1>;
}

export function Section({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="border-border bg-card space-y-4 rounded-2xl border p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-3xl font-bold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold">
        {label}
      </label>
      {children(id)}
      {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
    </div>
  );
}

export function Check({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-5"
      />
      {label}
    </label>
  );
}

export function Feedback({ error, saved }: { error: unknown; saved?: boolean }): ReactNode {
  if (error) {
    return (
      <p role="alert" className="text-destructive text-sm font-medium">
        {adminErrorMessage(error)}
      </p>
    );
  }
  return saved ? (
    <p role="status" className="text-sm font-medium text-green-700">
      Guardado.
    </p>
  ) : null;
}

export function SaveBar({
  pending,
  error,
  saved,
  label = "Guardar cambios",
  children,
}: {
  pending: boolean;
  error: unknown;
  saved?: boolean;
  label?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Guardando…" : label}
      </Button>
      {children}
      <Feedback error={error} saved={saved} />
    </div>
  );
}

export function QueryState({
  query,
  children,
}: {
  query: UseQueryResult<unknown>;
  children: ReactNode;
}) {
  if (query.isError) {
    return (
      <p role="alert" className="text-destructive font-medium">
        No hemos podido cargar los datos.
      </p>
    );
  }
  if (!query.data) return <p className="text-muted-foreground">Cargando…</p>;
  return <>{children}</>;
}

export function Tabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string;
  tabs: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "border-foreground/40 min-h-11 rounded-full border px-4 text-sm font-semibold",
            value === tab.id && "bg-charcoal text-cream border-charcoal",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** Convierte un texto de formulario en número entero o null si está vacío. */
export const toInt = (value: string): number | null => (value.trim() === "" ? null : Number(value));

/** Fecha ISO del servidor → valor de `<input type="date">`. */
export const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

/** Valor de `<input type="date">` → ISO (inicio del día UTC) o null. */
export const fromDateInput = (value: string): string | null =>
  value ? `${value}T00:00:00.000Z` : null;

/** Minutos desde medianoche ⇄ «HH:MM». */
export const minutesToTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
export const timeToMinutes = (value: string) => {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
};
