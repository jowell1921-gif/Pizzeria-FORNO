import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";

const app = createApp({ CORS_ORIGINS: ["http://localhost:3000"] });

describe("GET /api/v1/health", () => {
  it("responds with status ok", async () => {
    const response = await request(app).get("/api/v1/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { status: "ok" } });
  });

  it("sets security headers and hides the framework", async () => {
    const response = await request(app).get("/api/v1/health");
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("returns a JSON 404 for unknown routes", async () => {
    const response = await request(app).get("/api/v1/unknown");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });
});
