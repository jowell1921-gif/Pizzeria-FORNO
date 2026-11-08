"use client";

import { useEffect, useRef, useState } from "react";

import { API_URL } from "@/lib/api";

import { connectOrderStream, type OrderStreamEvent } from "./order-stream";

/**
 * Avisos de pedidos en directo. Devuelve si la conexión está activa. Si el flujo cae, la pantalla
 * debe seguir funcionando con consulta periódica (`refetchInterval`) como respaldo.
 */
export function useOrderStream(
  scope: "kitchen" | "admin",
  token: string | null,
  onEvent: (event: OrderStreamEvent) => void,
): boolean {
  const [connected, setConnected] = useState(false);
  const tokenRef = useRef(token);
  const handlerRef = useRef(onEvent);

  useEffect(() => {
    tokenRef.current = token;
    handlerRef.current = onEvent;
  });

  const hasToken = token !== null;
  useEffect(() => {
    if (!hasToken) return;
    const controller = new AbortController();
    void connectOrderStream({
      url: `${API_URL}/${scope}/stream`,
      getToken: () => tokenRef.current,
      onEvent: (event) => handlerRef.current(event),
      onStatus: setConnected,
      signal: controller.signal,
    });
    return () => controller.abort();
  }, [scope, hasToken]);

  return connected;
}
