import { findZoneForPostalCode } from "./postal-codes.js";
import { z } from "zod";

import type { Prisma, PrismaClient } from "../../db/client.js";

const money = (value: Prisma.Decimal) => value.toFixed(2);

export const postalCodeQuerySchema = z.object({
  postalCode: z
    .string()
    .trim()
    .regex(/^[0-9]{5}$/, "Postal code must have 5 digits"),
});

const zoneView = (zone: {
  id: string;
  name: string;
  postalCodes: string[];
  deliveryFee: Prisma.Decimal;
  minimumOrder: Prisma.Decimal;
  estimatedMinutes: number;
}) => ({
  id: zone.id,
  name: zone.name,
  postalCodes: zone.postalCodes,
  deliveryFee: money(zone.deliveryFee),
  minimumOrder: money(zone.minimumOrder),
  estimatedMinutes: zone.estimatedMinutes,
});

const activeZone = { active: true, deletedAt: null } as const;

/** Zonas de reparto activas con sus condiciones (público). */
export async function listDeliveryZones(prisma: PrismaClient) {
  const zones = await prisma.deliveryZone.findMany({ where: activeZone, orderBy: { name: "asc" } });
  return zones.map(zoneView);
}

/** ¿Reparte el local en este código postal? Si sí, devuelve las condiciones de la zona. */
export async function checkDelivery(prisma: PrismaClient, query: unknown) {
  const { postalCode } = postalCodeQuerySchema.parse(query);
  const zone = findZoneForPostalCode(
    await prisma.deliveryZone.findMany({ where: activeZone }),
    postalCode,
  );
  return { postalCode, covered: zone !== null, zone: zone ? zoneView(zone) : null };
}
