import type { ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FieldProps extends Omit<React.ComponentProps<typeof Input>, "id"> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
}

/** Campo de formulario accesible: etiqueta, ayuda y error asociados al control. */
export function Field({ id, label, error, hint, ...inputProps }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        {...inputProps}
      />
      {hint ? (
        <p id={hintId} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-destructive text-sm font-medium">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Mensaje de error general de un formulario (anunciado por los lectores de pantalla). */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className="border-destructive bg-destructive/5 text-destructive rounded-lg border p-3 text-sm font-medium"
    >
      {children}
    </div>
  );
}

/** Mensaje de confirmación de un formulario. */
export function FormSuccess({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="border-border bg-cream-soft rounded-lg border p-4 text-sm">
      {children}
    </div>
  );
}
