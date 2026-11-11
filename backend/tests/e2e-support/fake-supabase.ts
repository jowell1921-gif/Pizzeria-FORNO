import { createServer } from "node:http";

import { SignJWT, exportJWK, generateKeyPair } from "jose";

/**
 * «Supabase» de pruebas SOLO para las pruebas de navegador del panel (npm run test:e2e:panel).
 *
 * Publica un JWKS con una clave generada al arrancar y firma tokens con la misma forma que los de
 * Supabase Auth. La API real y la web real verifican esos tokens con su código de producción, sin
 * ningún atajo: lo único que cambia es la URL de Supabase, que apunta a este servidor. No guarda
 * usuarios ni contraseñas y solo escucha en localhost.
 */
const PORT = Number(process.env["PORT"] ?? 4300);
const ISSUER = `http://localhost:${PORT}/auth/v1`;

async function main() {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "e2e-key", alg: "ES256", use: "sig" };

  async function token(sub: string, email: string) {
    return new SignJWT({
      role: "authenticated",
      aal: "aal1",
      session_id: sub,
      is_anonymous: false,
      email,
      user_metadata: { full_name: email.split("@")[0] },
    })
      .setProtectedHeader({ alg: "ES256", kid: "e2e-key" })
      .setIssuer(ISSUER)
      .setAudience("authenticated")
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime("8h")
      .sign(privateKey);
  }

  createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
      if (url.pathname === "/health") {
        res.writeHead(200).end("ok");
      } else if (url.pathname === "/auth/v1/.well-known/jwks.json") {
        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end(JSON.stringify({ keys: [jwk] }));
      } else if (url.pathname === "/__token") {
        const sub = url.searchParams.get("sub") ?? "";
        const email = url.searchParams.get("email") ?? "";
        res.writeHead(200, { "Content-Type": "text/plain" }).end(await token(sub, email));
      } else {
        res.writeHead(404).end();
      }
    })();
  }).listen(PORT, "127.0.0.1", () => console.log(`fake supabase on ${PORT}`));
}

void main();
