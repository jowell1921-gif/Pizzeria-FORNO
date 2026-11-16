import type { Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

import { orderEvents } from "../src/events/order-events.js";
import { orderEventStream } from "../src/utils/sse.js";

/** Respuesta falsa que recoge lo que se escribe en el flujo. */
function fakeStream(onlyUserOf?: () => string | undefined) {
  const writes: string[] = [];
  const listeners: Array<() => void> = [];
  const res = {
    status: () => res,
    setHeader: () => res,
    flushHeaders: () => undefined,
    write: (chunk: string) => writes.push(chunk),
    end: () => undefined,
    on: (_event: string, listener: () => void) => listeners.push(listener),
  } as unknown as Response;
  const req = {
    on: (_event: string, listener: () => void) => listeners.push(listener),
  } as unknown as Request;
  orderEventStream(onlyUserOf)(req, res, vi.fn());
  return { writes, close: () => listeners.forEach((listener) => listener()) };
}

const events = (writes: string[]) =>
  writes.filter((chunk) => chunk.startsWith("event: order")).map((chunk) => chunk);

const closers: Array<() => void> = [];
afterEach(() => closers.splice(0).forEach((close) => close()));

describe("order event stream", () => {
  it("sends every event to the owner but never the owner's user id to anyone", () => {
    const stream = fakeStream();
    closers.push(stream.close);
    orderEvents.publish({
      kind: "created",
      orderId: "o1",
      orderNumber: 1,
      status: "NEW",
      userId: "juan",
    });
    orderEvents.publish({
      kind: "created",
      orderId: "o2",
      orderNumber: 2,
      status: "NEW",
      userId: "pedro",
    });
    const sent = events(stream.writes);
    expect(sent).toHaveLength(2);
    for (const chunk of sent) expect(chunk).not.toContain("userId");
  });

  it("sends a demo visitor only the events of their own orders", () => {
    const stream = fakeStream(() => "juan");
    closers.push(stream.close);
    orderEvents.publish({
      kind: "created",
      orderId: "o1",
      orderNumber: 1,
      status: "NEW",
      userId: "juan",
    });
    orderEvents.publish({
      kind: "created",
      orderId: "o2",
      orderNumber: 2,
      status: "NEW",
      userId: "pedro",
    });
    orderEvents.publish({ kind: "status", orderId: "o3", orderNumber: 3, status: "READY" });
    const sent = events(stream.writes);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('"orderId":"o1"');
  });
});
