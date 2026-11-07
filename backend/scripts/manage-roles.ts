/**
 * Concede o retira roles desde la línea de comandos. Sirve para crear el primer administrador
 * (cuando todavía no existe ninguno que pueda hacerlo desde el panel).
 *
 *   npm run roles -- grant  usuario@correo.com ADMIN
 *   npm run roles -- revoke usuario@correo.com STAFF
 *
 * La persona debe haber iniciado sesión al menos una vez (así existe su perfil). Cada cambio
 * queda registrado en la auditoría.
 */
import { grantRole, revokeRole } from "../src/auth/roles-service.js";
import { createPrismaClient } from "../src/db/client.js";

const ROLES = ["ADMIN", "STAFF", "KITCHEN"] as const;
type Role = (typeof ROLES)[number];

const [action, email, role] = process.argv.slice(2);

function usage(message: string): never {
  console.error(`${message}\nUso: npm run roles -- <grant|revoke> <correo> <ADMIN|STAFF|KITCHEN>`);
  process.exit(1);
}

if (action !== "grant" && action !== "revoke") usage("Acción no válida.");
if (!email?.includes("@")) usage("Indica un correo válido.");
if (!ROLES.includes(role as Role)) usage("Indica un rol válido.");

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) usage("Falta DATABASE_URL.");

const prisma = createPrismaClient(databaseUrl);
try {
  const change = {
    email,
    role: role as Role,
    reason: "Cambio realizado desde la línea de comandos",
  };
  const result =
    action === "grant" ? await grantRole(prisma, change) : await revokeRole(prisma, change);
  console.log(
    result.changed
      ? `Hecho: ${action === "grant" ? "concedido" : "retirado"} ${role} a ${email}.`
      : `Sin cambios: ${email} ${action === "grant" ? "ya tenía" : "no tenía"} el rol ${role}.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
