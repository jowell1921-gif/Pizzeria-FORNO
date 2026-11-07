"use client";

import { useCallback, useEffect, useState } from "react";

interface Result<T> {
  key: string;
  data?: T;
  error?: unknown;
}

export type ResourceStatus = "idle" | "loading" | "ready" | "error";

/**
 * Carga un recurso de la API con el token de la sesión. El resultado está asociado a la clave
 * (token + versión): si cambia la sesión o se pide recargar, se vuelve a cargar y mientras tanto
 * el estado es «loading». `load` debe ser una función estable (definida fuera del componente).
 */
export function useApiResource<T>(token: string | null, load: (token: string) => Promise<T>) {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<Result<T> | null>(null);
  const key = token ? `${token}:${version}` : null;

  useEffect(() => {
    if (!key || !token) return;
    let cancelled = false;
    load(token).then(
      (data) => {
        if (!cancelled) setResult({ key, data });
      },
      (error: unknown) => {
        if (!cancelled) setResult({ key, error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, token, load]);

  const current = result?.key === key ? result : null;
  const status: ResourceStatus = !key
    ? "idle"
    : !current
      ? "loading"
      : current.error !== undefined
        ? "error"
        : "ready";

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  /** Sustituye los datos cargados (por ejemplo, tras guardar un cambio) sin volver a pedirlos. */
  const mutate = useCallback(
    (update: (previous: T | undefined) => T) => {
      if (!key) return;
      setResult((previous) => ({
        key,
        data: update(previous?.key === key ? previous.data : undefined),
      }));
    },
    [key],
  );

  return { status, data: current?.data, error: current?.error, reload, mutate };
}
