import { describe, expect, it, vi } from "vitest";

import { createAnthropicModel, type MessagesClient } from "../src/modules/assistant/model.js";

/** Respuesta mínima con la forma de la del SDK. */
function reply(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    stop_reason: "end_turn",
    stop_sequence: null,
    content: [
      { type: "thinking", thinking: "", signature: "s" },
      { type: "text", text: "Hola, " },
      { type: "text", text: "tenemos Margherita." },
    ],
    usage: { input_tokens: 1200, output_tokens: 40, cache_read_input_tokens: 1100 },
    ...overrides,
  };
}

function fakeClient(response: unknown) {
  const create = vi.fn().mockResolvedValue(response);
  const client = { beta: { messages: { create } } } as unknown as MessagesClient;
  return { client, create };
}

const request = {
  system: { instructions: "Eres PizzAI.", knowledge: "DATOS DE FORNEA\n- Margherita 9.50 €" },
  messages: [
    { role: "user" as const, content: "¿Qué pizzas tenéis?" },
    { role: "assistant" as const, content: "Tenemos varias." },
    { role: "user" as const, content: "¿Y la más barata?" },
  ],
};

describe("createAnthropicModel", () => {
  it("sends the conversation with the fixed instructions and the business data, nothing else", async () => {
    const { client, create } = fakeClient(reply());
    const model = createAnthropicModel({
      apiKey: "k".repeat(30),
      model: "claude-opus-5-5",
      client,
    });
    await model.complete(request);

    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0]![0];
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.messages).toEqual(request.messages);
    expect(params.system).toEqual([
      { type: "text", text: "Eres PizzAI." },
      {
        type: "text",
        text: "DATOS DE FORNEA\n- Margherita 9.50 €",
        cache_control: { type: "ephemeral" },
      },
    ]);
    // Sin los parámetros que los modelos actuales rechazan.
    for (const key of ["temperature", "top_p", "top_k", "tool_choice", "thinking"]) {
      expect(params, key).not.toHaveProperty(key);
    }
    expect(params.output_config).toEqual({ effort: "low" });
    expect(params.max_tokens).toBeGreaterThanOrEqual(1000);
  });

  it("asks the API to retry on another model if the safety classifiers decline", async () => {
    const { client, create } = fakeClient(reply());
    await createAnthropicModel({
      apiKey: "k".repeat(30),
      model: "claude-opus-5-5",
      client,
    }).complete(request);
    const params = create.mock.calls[0]![0];
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.fallbacks).toBe("default");
  });

  it("returns only the text blocks (never the reasoning) and the token usage", async () => {
    const { client } = fakeClient(reply());
    const result = await createAnthropicModel({
      apiKey: "k".repeat(30),
      model: "m",
      client,
    }).complete(request);
    expect(result.text).toBe("Hola, \ntenemos Margherita.");
    expect(result.refused).toBe(false);
    expect(result.usage).toEqual({ inputTokens: 1200, outputTokens: 40, cachedTokens: 1100 });
  });

  it("reports a refusal instead of an empty answer", async () => {
    const { client } = fakeClient(reply({ stop_reason: "refusal", content: [] }));
    const result = await createAnthropicModel({
      apiKey: "k".repeat(30),
      model: "m",
      client,
    }).complete(request);
    expect(result.refused).toBe(true);
    expect(result.text).toBe("");
  });

  it("passes the cancellation signal and a timeout to the SDK", async () => {
    const { client, create } = fakeClient(reply());
    const controller = new AbortController();
    await createAnthropicModel({ apiKey: "k".repeat(30), model: "m", client }).complete({
      ...request,
      signal: controller.signal,
    });
    const options = create.mock.calls[0]![1];
    expect(options.signal).toBe(controller.signal);
    expect(options.timeout).toBeGreaterThan(0);
  });
});
