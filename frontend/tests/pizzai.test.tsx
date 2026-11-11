import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));

import type { AssistantClient } from "@/features/assistant/assistant-client";
import { createDemoAssistant, demoReply } from "@/features/assistant/demo-assistant";
import { PizzaiAssistant } from "@/features/assistant/pizzai-assistant";
import { SUGGESTIONS, WELCOME_MESSAGE } from "@/features/assistant/suggestions";

const instant = createDemoAssistant(0);

function open() {
  return userEvent.setup().click(screen.getByRole("button", { name: "Abrir el chat con PizzAI" }));
}

beforeEach(() => {
  mocks.pathname = "/";
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PizzAI launcher and chat", () => {
  it("floats as a button and opens a chat with the welcome message and the 4 suggestions", async () => {
    render(<PizzaiAssistant client={instant} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await open();

    const chat = await screen.findByRole("dialog", { name: "Chat con PizzAI" });
    expect(within(chat).getByText(WELCOME_MESSAGE)).toBeInTheDocument();
    for (const suggestion of SUGGESTIONS) {
      expect(within(chat).getByRole("button", { name: suggestion })).toBeInTheDocument();
    }
    // Es honesto sobre lo que es: no se presenta como una IA conectada.
    expect(within(chat).getByText(/Modo demostración/)).toBeInTheDocument();
    expect(within(chat).getByText(/aún no usa inteligencia artificial/)).toBeInTheDocument();
    expect(screen.getByLabelText("Escribe tu pregunta")).toHaveFocus();
  });

  it("answers a suggestion with a provisional reply and a useful link, showing «escribiendo»", async () => {
    let release: () => void = () => {};
    const slow: AssistantClient = {
      send: () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              text: "Mira la carta.",
              links: [{ label: "Ver la carta", href: "/carta" }],
              provisional: true,
            });
        }),
    };
    render(<PizzaiAssistant client={slow} />);
    await open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "¿Qué pizzas tenéis?" }));

    expect(screen.getByText("¿Qué pizzas tenéis?")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("PizzAI está escribiendo");
    expect(screen.getByRole("button", { name: "Enviar mensaje" })).toBeDisabled();

    act(() => release());
    expect(await screen.findByText("Mira la carta.")).toBeInTheDocument();
    expect(screen.getByText("Respuesta de demostración (provisional)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver la carta" })).toHaveAttribute("href", "/carta");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    // Las sugerencias solo se ofrecen al principio.
    expect(screen.queryByRole("group", { name: "Preguntas sugeridas" })).not.toBeInTheDocument();
  });

  it("sends what the user types, ignores empty text and shows it as plain text", async () => {
    const send = vi.fn(async (...args: [unknown, string]) => ({
      text: `ok ${args[1].length}`,
      provisional: true,
    }));
    render(<PizzaiAssistant client={{ send }} />);
    await open();
    const user = userEvent.setup();
    const box = await screen.findByLabelText("Escribe tu pregunta");
    expect(screen.getByRole("button", { name: "Enviar mensaje" })).toBeDisabled();

    await user.type(box, "   ");
    expect(screen.getByRole("button", { name: "Enviar mensaje" })).toBeDisabled();
    await user.type(box, "<b>hola</b>{Enter}");
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0]?.[1]).toBe("<b>hola</b>");
    expect(screen.getByText("<b>hola</b>")).toBeInTheDocument();
    expect(box).toHaveValue("");
  });

  it("closes with the button or Escape and gives the focus back to the character", async () => {
    render(<PizzaiAssistant client={instant} />);
    await open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Cerrar el chat" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir el chat con PizzAI" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Abrir el chat con PizzAI" }));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reports a failure without breaking the chat", async () => {
    const client: AssistantClient = { send: () => Promise.reject(new Error("down")) };
    render(<PizzaiAssistant client={client} />);
    await open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "¿Tenéis promociones?" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No he podido responder");
    expect(screen.getByLabelText("Escribe tu pregunta")).toBeEnabled();
  });

  it("is hidden on the checkout and visible elsewhere", () => {
    mocks.pathname = "/pedido";
    const { unmount } = render(<PizzaiAssistant client={instant} />);
    expect(screen.queryByRole("button", { name: "Abrir el chat con PizzAI" })).toBeNull();
    unmount();
    mocks.pathname = "/pedido/123";
    render(<PizzaiAssistant client={instant} />);
    expect(screen.getByRole("button", { name: "Abrir el chat con PizzAI" })).toBeInTheDocument();
  });

  it("greets from time to time while closed, but never with reduced motion", () => {
    vi.useFakeTimers();
    const { unmount } = render(<PizzaiAssistant client={instant} />);
    expect(screen.queryByText("¡Hola! ¿Te ayudo?")).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(8_100);
    });
    expect(screen.getByText("¡Hola! ¿Te ayudo?")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4_100);
    });
    expect(screen.queryByText("¡Hola! ¿Te ayudo?")).not.toBeInTheDocument();
    unmount();

    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    render(<PizzaiAssistant client={instant} />);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.queryByText("¡Hola! ¿Te ayudo?")).not.toBeInTheDocument();
  });
});

describe("demo replies", () => {
  it("point to the right page, are marked provisional and invent no business data", () => {
    const cases: Array<[string, string]> = [
      ["¿Qué pizzas tenéis?", "/carta"],
      ["¿Qué me recomiendas?", "/carta"],
      ["¿Tenéis promociones?", "/promociones"],
      ["¿Cómo funciona el reparto?", "/carta"],
      ["¿Cómo gano puntos?", "/forno-club"],
    ];
    for (const [question, href] of cases) {
      const reply = demoReply(question);
      expect(reply.provisional, question).toBe(true);
      expect(reply.links?.[0]?.href, question).toBe(href);
      expect(reply.text).not.toMatch(/\d+[,.]?\d*\s?€|\d{1,2}:\d{2}/);
    }
    const unknown = demoReply("¿Cuál es la capital de Francia?");
    expect(unknown.provisional).toBe(true);
    expect(unknown.links).toBeUndefined();
    expect(unknown.text).toMatch(/versión de demostración/);
  });

  it("can be cancelled", async () => {
    const controller = new AbortController();
    const pending = createDemoAssistant(1000).send([], "hola", controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
