import { seedDemoData } from "../../prisma/seed-demo-data.js";
import { createPrismaClient } from "../../src/db/client.js";
import { adjustPoints } from "../../src/modules/loyalty/ledger.service.js";
import { enqueueOrderEmail } from "../../src/modules/notifications/notification.service.js";
import { buildOrder, resetDatabase } from "../db/helpers.js";

/**
 * Datos para las pruebas de navegador del panel: un administrador, personal, cocina y un cliente,
 * con pedidos en cada estado. Solo se ejecuta contra una base de datos cuyo nombre acaba en _test.
 */
export const E2E_USERS = {
  admin: { id: "a0000000-0000-4000-8000-000000000001", email: "admin@e2e.test", role: "ADMIN" },
  staff: { id: "a0000000-0000-4000-8000-000000000002", email: "staff@e2e.test", role: "STAFF" },
  kitchen: {
    id: "a0000000-0000-4000-8000-000000000003",
    email: "kitchen@e2e.test",
    role: "KITCHEN",
  },
  customer: { id: "a0000000-0000-4000-8000-000000000004", email: "cliente@e2e.test", role: null },
  // Administrador que NO es el propietario (OWNER_EMAIL = admin@e2e.test): ve todo en modo lectura.
  viewer: { id: "a0000000-0000-4000-8000-000000000005", email: "viewer@e2e.test", role: "ADMIN" },
} as const;

async function main() {
  const url = process.env["DATABASE_URL"] ?? "";
  if (!/_test(\?|$)/.test(url)) throw new Error("seed-panel only runs against a *_test database");
  const prisma = createPrismaClient(url);
  try {
    await resetDatabase(prisma);
    await seedDemoData(prisma);

    let index = 0;
    for (const [key, user] of Object.entries(E2E_USERS)) {
      index += 1;
      await prisma.profile.create({
        data: {
          id: user.id,
          email: user.email,
          fullName: `Usuario ${user.role ?? "cliente"}`,
          username: `e2e_${key === "customer" ? "cliente" : key}`,
          phone: `+34 600 000 00${index}`,
        },
      });
      if (user.role) await prisma.userRole.create({ data: { userId: user.id, role: user.role } });
    }
    await adjustPoints(prisma, {
      userId: E2E_USERS.customer.id,
      actorId: E2E_USERS.admin.id,
      points: 150,
      reason: "Puntos de bienvenida de prueba",
    });
    await prisma.address.create({
      data: {
        userId: E2E_USERS.customer.id,
        recipientName: "Cliente de Prueba",
        line1: "Calle Mayor 1",
        postalCode: "28001",
        city: "Madrid",
        isDefault: true,
      },
    });

    const product = await prisma.product.findFirstOrThrow({ where: { slug: "margherita" } });
    const now = new Date();
    const plan = [
      { status: "NEW", type: "PICKUP" },
      { status: "ACCEPTED", type: "PICKUP", acceptedAt: now },
      { status: "PREPARING", type: "DELIVERY", acceptedAt: now },
      { status: "READY", type: "PICKUP", acceptedAt: now, readyAt: now },
      { status: "READY", type: "DELIVERY", acceptedAt: now, readyAt: now },
      { status: "COMPLETED", type: "PICKUP", acceptedAt: now, readyAt: now, completedAt: now },
    ] as const;
    for (const entry of plan) {
      const data = buildOrder({
        userId: E2E_USERS.customer.id,
        productId: product.id,
        type: entry.type,
        quantity: 2,
        unitPrice: "9.50",
      });
      const order = await prisma.order.create({
        data: {
          ...data,
          status: entry.status,
          customerEmail: E2E_USERS.customer.email,
          customerPhone: "+34 600 000 004",
          notes: "Sin albahaca, por favor",
          estimatedReadyAt: new Date(now.getTime() + 20 * 60_000),
          ...("acceptedAt" in entry ? { acceptedAt: entry.acceptedAt } : {}),
          ...("readyAt" in entry ? { readyAt: entry.readyAt } : {}),
          ...("completedAt" in entry ? { completedAt: entry.completedAt } : {}),
          payments: {
            create: {
              method: entry.type === "PICKUP" ? "CASH_PICKUP" : "CASH_DELIVERY",
              status: entry.status === "COMPLETED" ? "CASH_COLLECTED" : "CASH_PENDING",
              amount: data.total,
              ...(entry.status === "COMPLETED" ? { paidAt: now } : {}),
            },
          },
        },
      });
      await enqueueOrderEmail(prisma, order.id, "ORDER_CONFIRMED");
    }
    console.log("panel e2e data ready");
  } finally {
    await prisma.$disconnect();
  }
}

void main();
