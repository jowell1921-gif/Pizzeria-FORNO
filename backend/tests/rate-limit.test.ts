import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";

const limits = { windowMs: 60_000, ipMax: 3, userMax: 100, userWriteMax: 100 };
const app = createApp({ CORS_ORIGINS: ["http://localhost:3000"], rateLimits: limits });

describe("rate limiting", () => {
  it("answers 429 in the API error format after the per-IP limit", async () => {
    for (let i = 0; i < 3; i += 1) {
      expect((await request(app).get("/api/v1/unknown")).status).toBe(404);
    }
    const blocked = await request(app).get("/api/v1/unknown");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    expect(blocked.body.error.requestId).toBeTruthy();
    expect(blocked.headers["retry-after"]).toBeDefined();
    expect(blocked.headers["ratelimit"]).toBeDefined();
  });

  it("never rate-limits the health check", async () => {
    for (let i = 0; i < 10; i += 1) {
      expect((await request(app).get("/api/v1/health")).status).toBe(200);
    }
  });

  it("does not trust X-Forwarded-For unless a proxy is configured", async () => {
    const own = createApp({ CORS_ORIGINS: [], rateLimits: { ...limits, ipMax: 2 } });
    for (let i = 0; i < 2; i += 1) {
      await request(own).get("/api/v1/unknown").set("X-Forwarded-For", `10.0.0.${i}`);
    }
    // Cambiar la cabecera no da un contador nuevo: sigue siendo la misma IP.
    const third = await request(own).get("/api/v1/unknown").set("X-Forwarded-For", "10.0.0.99");
    expect(third.status).toBe(429);
  });
});
