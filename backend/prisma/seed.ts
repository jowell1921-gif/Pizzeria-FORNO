import { createPrismaClient } from "../src/db/client.js";
import { seedDemoData } from "./seed-demo-data.js";

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed the database");
}
if (process.env["NODE_ENV"] === "production") {
  throw new Error("Refusing to seed demo data in production");
}

const prisma = createPrismaClient(databaseUrl);

try {
  const summary = await seedDemoData(prisma);
  console.log("Demo data seeded:", summary);
} finally {
  await prisma.$disconnect();
}
