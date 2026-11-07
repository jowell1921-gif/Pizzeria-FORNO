import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ApiError, apiRequest } from "@/lib/api";

const schema = z.object({ id: z.string() });

function mockFetch(response: Response | Error) {
  const fetchMock = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiRequest", () => {
  it("sends the access token as a Bearer credential and returns the validated data", async () => {
    const fetchMock = mockFetch(Response.json({ data: { id: "42" } }));
    const result = await apiRequest("/me", { token: "tok-123", schema });

    expect(result).toEqual({ id: "42" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe("http://localhost:4000/api/v1/me");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok-123");
    expect(init.cache).toBe("no-store");
  });

  it("sends JSON bodies with the right method", async () => {
    const fetchMock = mockFetch(Response.json({ data: { id: "1" } }));
    await apiRequest("/me", { token: "t", method: "PATCH", body: { fullName: "Ana" }, schema });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ fullName: "Ana" }));
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
  });

  it("turns API errors into ApiError with the code the server sent", async () => {
    mockFetch(
      Response.json({ error: { code: "TOKEN_EXPIRED", message: "expired" } }, { status: 401 }),
    );
    await expect(apiRequest("/me", { token: "t", schema })).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      code: "TOKEN_EXPIRED",
    });
  });

  it("handles error responses that are not JSON", async () => {
    mockFetch(new Response("Bad gateway", { status: 502 }));
    await expect(apiRequest("/me", { token: "t", schema })).rejects.toMatchObject({
      status: 502,
      code: "UNKNOWN_ERROR",
    });
  });

  it("reports connection failures with status 0", async () => {
    mockFetch(new TypeError("fetch failed"));
    const error = await apiRequest("/me", { token: "t", schema }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });

  it("rejects a response that does not match the expected shape", async () => {
    mockFetch(Response.json({ data: { unexpected: true } }));
    await expect(apiRequest("/me", { token: "t", schema })).rejects.toThrow();
  });
});
