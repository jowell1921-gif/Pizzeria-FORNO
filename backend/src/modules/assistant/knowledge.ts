import type { PrismaClient } from "../../db/client.js";
import { listCategories, listProducts } from "../catalog/catalog.service.js";
import { listDeliveryZones } from "../delivery/delivery.service.js";
import { getLoyaltyProgram } from "../loyalty/loyalty.service.js";
import { listPromotions } from "../promotions/promotions.service.js";
import { getStoreSettings } from "../store/store.service.js";

const DAYS = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const PAYMENT = {
  ONLINE: "tarjeta (pago online)",
  CASH_PICKUP: "efectivo al recoger",
  CASH_DELIVERY: "efectivo al recibir",
} as const;

const clock = (minute: number) =>
  `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/**
 * Datos de FORNO que PizzAI puede usar. Se construyen SOLO con los mismos servicios públicos que
 * alimentan la web (carta, promociones, zonas, ajustes del local y FORNO CLUB): nunca con clientes,
 * pedidos, pagos ni datos internos. El texto resultante va a un proveedor externo de IA, así que
 * esta es la frontera de lo que se comparte.
 */
export async function buildKnowledge(prisma: PrismaClient, onlineAvailable: boolean) {
  const [store, categories, products, promotions, zones, club] = await Promise.all([
    getStoreSettings(prisma, new Date(), onlineAvailable),
    listCategories(prisma),
    listProducts(prisma, {}),
    listPromotions(prisma),
    listDeliveryZones(prisma),
    getLoyaltyProgram(prisma),
  ]);

  const lines: string[] = ["DATOS DE FORNO", ""];

  lines.push(
    `Local: ${store.name}. ${store.address.line}, ${store.address.postalCode} ${store.address.city}. Teléfono: ${store.phone}.`,
  );
  const modes = [
    store.pickupEnabled ? "recogida en el local" : null,
    store.deliveryEnabled ? "entrega a domicilio" : null,
  ].filter(Boolean);
  lines.push(
    `Modalidades: ${modes.join(" y ") || "ninguna ahora mismo"}. Tiempo estimado: recogida ${store.prepTimeMinutes} min, domicilio ${store.deliveryTimeMinutes} min.`,
  );
  lines.push(
    `Pago: ${store.enabledPaymentMethods.map((method) => PAYMENT[method]).join(", ") || "consultar"}. Los precios incluyen IVA.`,
  );
  if (store.ordersPaused) lines.push("Ahora mismo los pedidos online están pausados.");

  lines.push("", "Horario semanal:");
  for (let day = 1; day <= 7; day += 1) {
    const slots = store.openingHours
      .filter((slot) => slot.dayOfWeek === day)
      .map((slot) => `${clock(slot.openMinute)}-${clock(slot.closeMinute)}`);
    lines.push(`- ${DAYS[day]}: ${slots.length ? slots.join(" y ") : "cerrado"}`);
  }
  const specials = store.specialDays
    .slice(0, 10)
    .map(
      (day) =>
        `${day.date}: ${day.closed ? "cerrado" : `${clock(day.openMinute ?? 0)}-${clock(day.closeMinute ?? 0)}`}${day.note ? ` (${day.note})` : ""}`,
    );
  if (specials.length) lines.push(`Días especiales: ${specials.join("; ")}.`);

  lines.push("", "Reparto a domicilio (por código postal):");
  if (zones.length === 0) lines.push("- No hay zonas de reparto configuradas.");
  for (const zone of zones) {
    lines.push(
      `- ${zone.name}: códigos postales ${zone.postalCodes.join(", ")}; envío ${zone.deliveryFee} €; pedido mínimo ${zone.minimumOrder} €; unos ${zone.estimatedMinutes} min.`,
    );
  }

  lines.push("", "Carta (precios con IVA incluido; «agotado» = no disponible ahora):");
  for (const category of categories) {
    lines.push(`${category.name}:`);
    for (const product of products.filter((item) => item.categorySlug === category.slug)) {
      const tags = [
        product.popular ? "popular" : null,
        product.vegetarian ? "vegetariano" : null,
        product.available ? null : "agotado",
      ].filter(Boolean);
      const allergens = product.allergens.map((allergen) => allergen.name).join(", ");
      lines.push(
        `- ${product.name} — ${product.price} €${tags.length ? ` (${tags.join(", ")})` : ""}. ${product.description}` +
          (product.ingredients.length ? ` Ingredientes: ${product.ingredients.join(", ")}.` : "") +
          (allergens ? ` Alérgenos: ${allergens}.` : " Alérgenos: ninguno declarado."),
      );
      for (const group of product.optionGroups) {
        const options = group.options
          .filter((option) => option.available)
          .map((option) => {
            const delta = Number(option.priceDelta);
            return `${option.name}${delta !== 0 ? ` (${delta > 0 ? "+" : ""}${option.priceDelta} €)` : ""}`;
          });
        lines.push(
          `  Opciones «${group.name}»${group.required ? " (obligatorio)" : ""}: ${options.join(", ")}.`,
        );
      }
    }
  }

  lines.push("", "Promociones activas:");
  if (promotions.length === 0) lines.push("- Ahora mismo no hay promociones activas.");
  for (const promotion of promotions) {
    const value =
      promotion.kind === "COMBO"
        ? `combo a ${promotion.comboPrice} €`
        : promotion.discountType === "PERCENT"
          ? `${Number(promotion.discountValue)} % de descuento`
          : `${promotion.discountValue} € de descuento`;
    lines.push(
      `- ${promotion.name}: ${value}. ${promotion.description}` +
        (promotion.code ? ` Código: ${promotion.code}.` : "") +
        (promotion.endsAt ? ` Válida hasta ${promotion.endsAt.slice(0, 10)}.` : "") +
        (promotion.conditions.length ? ` Condiciones: ${promotion.conditions.join("; ")}.` : ""),
    );
  }

  lines.push("", "FORNO CLUB (programa de puntos):");
  lines.push(
    `- ${club.pointsPerEuro ?? "?"} punto(s) por euro de productos, al completar el pedido.${club.expiryDays ? ` Los puntos caducan a los ${club.expiryDays} días.` : " Los puntos no caducan."}`,
  );
  for (const reward of club.rewards) {
    lines.push(
      `- Recompensa «${reward.name}»: ${reward.pointsCost} puntos.${reward.inStock ? "" : " (agotada)"}`,
    );
  }

  return lines.join("\n");
}

/** Los datos cambian poco: se reutilizan durante un minuto para no consultar la base de datos en cada mensaje. */
export function createKnowledgeProvider(
  prisma: PrismaClient,
  options: { onlineAvailable: boolean; ttlMs?: number; now?: () => number },
) {
  const ttl = options.ttlMs ?? 60_000;
  const now = options.now ?? Date.now;
  let cached: { text: string; at: number } | null = null;
  return async () => {
    if (cached && now() - cached.at < ttl) return cached.text;
    const text = await buildKnowledge(prisma, options.onlineAvailable);
    cached = { text, at: now() };
    return text;
  };
}
