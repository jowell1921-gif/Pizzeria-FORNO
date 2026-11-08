import SwaggerParser from "@apidevtools/swagger-parser";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";

const base = { CORS_ORIGINS: ["http://localhost:3000"] };

describe("OpenAPI document", () => {
  it("is a valid OpenAPI 3.1 document with every reference resolved", async () => {
    const app = createApp(base);
    const response = await request(app).get("/api/v1/openapi.json");
    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe("3.1.0");
    // validate() falla si el documento no es válido o hay referencias rotas.
    await SwaggerParser.validate(structuredClone(response.body));
  });

  it("documents the public and the authenticated endpoints", async () => {
    const { body } = await request(createApp(base)).get("/api/v1/openapi.json");
    for (const path of [
      "/health",
      "/categories",
      "/products",
      "/products/{idOrSlug}",
      "/promotions",
      "/store/settings",
      "/delivery-zones",
      "/delivery-zones/check",
      "/me",
      "/me/addresses",
      "/me/addresses/{id}",
      "/loyalty/account",
      "/loyalty/transactions",
      "/loyalty/rewards",
      "/loyalty/program",
      "/admin/dashboard",
      "/admin/orders",
      "/admin/orders/{id}",
      "/admin/orders/{id}/status",
      "/admin/stream",
      "/kitchen/orders",
      "/kitchen/orders/{id}/status",
      "/kitchen/stream",
      "/loyalty/redemptions",
      "/orders/{id}/cancel",
      "/orders",
      "/orders/me",
      "/store/slots",
      "/checkout/quote",
      "/cart",
      "/orders/{id}",
    ]) {
      expect(body.paths[path], path).toBeDefined();
    }
    expect(body.paths["/me"].get.security).toEqual([{ bearerAuth: [] }]);
    expect(body.paths["/categories"].get.security).toBeUndefined();
  });

  it("serves Swagger UI from the same origin, without relaxing the CSP", async () => {
    const app = createApp(base);
    const page = await request(app).get("/api/v1/docs");
    expect(page.status).toBe(200);
    expect(page.headers["content-type"]).toMatch(/html/);
    expect(page.text).not.toMatch(/https?:\/\/(?!localhost)/);
    expect(page.headers["content-security-policy"]).toMatch(/script-src 'self'/);

    expect((await request(app).get("/api/v1/docs/init.js")).status).toBe(200);
    expect((await request(app).get("/api/v1/docs/assets/swagger-ui-bundle.js")).status).toBe(200);
  });

  it("is not published in production unless enabled explicitly", async () => {
    const hidden = createApp({ ...base, NODE_ENV: "production" });
    expect((await request(hidden).get("/api/v1/openapi.json")).status).toBe(404);
    expect((await request(hidden).get("/api/v1/docs")).status).toBe(404);

    const shown = createApp({ ...base, NODE_ENV: "production", API_DOCS_ENABLED: true });
    expect((await request(shown).get("/api/v1/openapi.json")).status).toBe(200);
  });
});
