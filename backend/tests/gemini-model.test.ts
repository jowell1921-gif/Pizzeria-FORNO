import { describe, expect, it, vi } from "vitest";

import { createGeminiModel, type FetchLike } from "../src/modules/assistant/gemini-model.js";

const request = {
  system: { instructions: "Eres PizzAI.", knowledge: "DATOS DE FORNO\n- Margherita 9.50 €" },
  messages: [
    { role: "user" as const, content: "¿Qué pizzas tenéis?" },
    { role: "assistant" as const, content: "Tenemos varias." },
    { role: "user" as const, content: "¿Y la más barata?" },
  ],
};

function fakeFetch(body: unknown, status = 200) {
  const fn = vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
  return { fn, fetch: fn as unknown as FetchLike };
}

const answer = {
  candidates: [
    {
      finishReason: "STOP",
      content: {
        parts: [{ text: "Pensando", thought: true }, { text: "La " }, { text: "Margherita." }],
      },
    },
  ],
  usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 20, cachedContentTokenCount: 5 },
};

describe("createGeminiModel", () => {
  it("sends the conversation with the key in a header and nothing else", async () => {
    const { fn, fetch } = fakeFetch(answer);
    await createGeminiModel({
      apiKey: "k".repeat(30),
      model: "gemini-flash-lite-latest",
      fetch,
    }).complete(request);

    const [url, init] = fn.mock.calls[0]!;
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent",
    );
    expect(url).not.toContain("k".repeat(30));
    expect(init.headers["x-goog-api-key"]).toBe("k".repeat(30));
    const body = JSON.parse(init.body);
    expect(body.systemInstruction.parts.map((p: { text: string }) => p.text)).toEqual([
      "Eres PizzAI.",
      "DATOS DE FORNO\n- Margherita 9.50 €",
    ]);
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual(["user", "model", "user"]);
  });

  it("returns only the visible text and the token usage", async () => {
    const { fetch } = fakeFetch(answer);
    const result = await createGeminiModel({ apiKey: "k".repeat(30), model: "m", fetch }).complete(
      request,
    );
    expect(result).toEqual({
      text: "La Margherita.",
      refused: false,
      usage: { inputTokens: 900, outputTokens: 20, cachedTokens: 5 },
    });
  });

  it("flags a blocked prompt or response as refused", async () => {
    const blockedPrompt = fakeFetch({ promptFeedback: { blockReason: "SAFETY" } });
    const blockedAnswer = fakeFetch({ candidates: [{ finishReason: "SAFETY" }] });
    for (const { fetch } of [blockedPrompt, blockedAnswer]) {
      const result = await createGeminiModel({
        apiKey: "k".repeat(30),
        model: "m",
        fetch,
      }).complete(request);
      expect(result.refused).toBe(true);
      expect(result.text).toBe("");
    }
  });

  it("retries once on a temporary overload", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => answer });
    const result = await createGeminiModel({
      apiKey: "k".repeat(30),
      model: "m",
      fetch: fn as unknown as FetchLike,
    }).complete(request);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(result.text).toBe("La Margherita.");
  });

  it("fails on an HTTP error without leaking the response", async () => {
    const { fetch } = fakeFetch({ error: { message: "secret detail" } }, 429);
    await expect(
      createGeminiModel({ apiKey: "k".repeat(30), model: "m", fetch }).complete(request),
    ).rejects.toThrow("HTTP 429");
  });
});
