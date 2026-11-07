import { createRequire } from "node:module";

import express, { Router } from "express";

import { buildOpenApiDocument } from "./openapi.js";

const require = createRequire(import.meta.url);

const DOCS_PAGE = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>FORNO API</title>
    <link rel="stylesheet" href="/api/v1/docs/assets/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/api/v1/docs/assets/swagger-ui-bundle.js"></script>
    <script src="/api/v1/docs/init.js"></script>
  </body>
</html>`;

const INIT_SCRIPT = `window.ui = SwaggerUIBundle({
  url: "/api/v1/openapi.json",
  dom_id: "#swagger-ui",
  deepLinking: true,
});`;

/**
 * Documentación de la API: el contrato `openapi.json` y una página Swagger UI. Los archivos de
 * Swagger UI se sirven desde el propio servidor (sin CDN), de modo que la política de seguridad de
 * contenido (CSP) de Helmet no necesita relajarse.
 */
export function createDocsRouter(): Router {
  const router = Router();
  const document = buildOpenApiDocument();
  const assets = require("swagger-ui-dist").getAbsoluteFSPath() as string;

  router.get("/openapi.json", (_req, res) => {
    res.json(document);
  });
  router.get("/docs", (_req, res) => {
    res.type("html").send(DOCS_PAGE);
  });
  router.get("/docs/init.js", (_req, res) => {
    res.type("js").send(INIT_SCRIPT);
  });
  router.use("/docs/assets", express.static(assets, { index: false, maxAge: "1d" }));

  return router;
}
