import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { PizzaiAssistant } from "@/features/assistant/pizzai-assistant";

interface Scenario {
  available?: boolean | "error";
  chat?: (body: { messages: Array<{ role: string; content: string }> }) => Response;
}

function mockApi(scenario: Scenario = {}) {
  const calls: Array<{
    key: string;
    body?: { messages: Array<{ role: string; content: string }> };
    auth: string | null;
  }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL | string, init: RequestInit = {}) => {
      const path = new URL(String(url)).pathname.replace("/api/v1", "");
      const key = `${init.method ?? "GET"} ${path}`;
      const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ key, body, auth: new Headers(init.headers).get("Authorization") });
      if (path === "/assistant/status") {
        if (scenario.available === "error") return new Response(null, { status: 500 });
        return Response.json({ data: { available: scenario.available ?? true } });
      }
      if (path === "/assistant/chat") {
        return (
          scenario.chat?.(body) ??
          Response.json({
            data: {
              text: "Tenemos Margherita por 9,50 €.",
              links: [{ label: "Ver la carta", href: "/carta" }],
            },
          })
        );
      }
      return Response.json({ data: [] });
    }),
  );
  return calls;
}

const openChat = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Abrir el chat con PizzAI" }));
  return user;
};

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("PizzAI with a real AI", () => {
  it("asks the server whether AI is available only when the chat is opened, and says it is AI", async () => {
    const calls = mockApi();
    render(<PizzaiAssistant />);
    expect(calls).toHaveLength(0); // abrir una página no consulta nada
    await openChat();

    expect(await screen.findByText("Asistente con inteligencia artificial")).toBeInTheDocument();
    expect(screen.getByText(/usa inteligencia artificial y puede equivocarse/)).toBeInTheDocument();
    expect(screen.queryByText(/Modo demostración/)).not.toBeInTheDocument();
    expect(calls.map((call) => call.key)).toEqual(["GET /assistant/status"]);
  });

  it("sends the conversation (starting at the user, without the greeting) and marks the answer as AI-generated", async () => {
    const calls = mockApi();
    render(<PizzaiAssistant />);
    const user = await openChat();
    await screen.findByText("Asistente con inteligencia artificial");

    await user.click(await screen.findByRole("button", { name: "¿Qué pizzas tenéis?" }));
    expect(await screen.findByText("Tenemos Margherita por 9,50 €.")).toBeInTheDocument();
    expect(screen.getByText("Generado por IA: puede contener errores")).toBeInTheDocument();
    expect(screen.queryByText("Respuesta de demostración (provisional)")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver la carta" })).toHaveAttribute("href", "/carta");

    const chat = calls.find((call) => call.key === "POST /assistant/chat")!;
    expect(chat.body).toEqual({ messages: [{ role: "user", content: "¿Qué pizzas tenéis?" }] });
    // Público: nunca se envía una sesión.
    expect(chat.auth).toBeNull();

    // La segunda pregunta incluye el historial, sin el saludo inicial.
    await user.type(screen.getByLabelText("Escribe tu pregunta"), "¿Y la más barata?{Enter}");
    await waitFor(() =>
      expect(calls.filter((call) => call.key === "POST /assistant/chat")).toHaveLength(2),
    );
    const second = calls.filter((call) => call.key === "POST /assistant/chat")[1]!;
    expect(second.body!.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(second.body!.messages[0]!.content).toBe("¿Qué pizzas tenéis?");
  });

  it("does not let the user send until it knows which mode applies", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await gate;
        return Response.json({ data: { available: true } });
      }),
    );
    render(<PizzaiAssistant />);
    await openChat();
    const send = screen.getByRole("button", { name: "Enviar mensaje" });
    await userEvent.setup().type(screen.getByLabelText("Escribe tu pregunta"), "hola");
    expect(send).toBeDisabled();
    await act(async () => release());
    await waitFor(() => expect(send).toBeEnabled());
  });

  it.each([
    ["ASSISTANT_LIMIT_REACHED", 429, /límite de hoy/],
    ["RATE_LIMITED", 429, /Espera unos minutos/],
    ["ASSISTANT_BUSY", 503, /muy ocupado/],
    ["ASSISTANT_ERROR", 502, /No he podido responder/],
  ])("explains %s in Spanish without leaking technical text", async (code, status, expected) => {
    mockApi({
      chat: () => Response.json({ error: { code, message: "provider-secret-detail" } }, { status }),
    });
    render(<PizzaiAssistant />);
    const user = await openChat();
    await screen.findByText("Asistente con inteligencia artificial");
    await user.click(await screen.findByRole("button", { name: "¿Tenéis promociones?" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(expected);
    expect(alert).not.toHaveTextContent(/provider-secret/);
    expect(screen.getByLabelText("Escribe tu pregunta")).toBeEnabled();
  });
});

describe("PizzAI without a real AI", () => {
  it.each([
    ["the server has no provider configured", false],
    ["the status request fails", "error" as const],
  ])("falls back to the labelled demo when %s", async (_name, available) => {
    const calls = mockApi({ available });
    render(<PizzaiAssistant />);
    const user = await openChat();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Enviar mensaje" })).toBeDisabled(),
    );
    expect(await screen.findByText(/Modo demostración/)).toBeInTheDocument();
    expect(screen.getByText(/aún no usa inteligencia artificial/)).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "¿Tenéis promociones?" }));
    expect(
      await screen.findByText("Respuesta de demostración (provisional)", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Generado por IA/)).not.toBeInTheDocument();
    // Ninguna petición al chat de la IA.
    expect(calls.some((call) => call.key === "POST /assistant/chat")).toBe(false);
    within(document.body);
  });
});
