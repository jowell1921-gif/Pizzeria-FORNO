import { z } from "zod";

import {
  createAddressSchema,
  updateAddressSchema,
} from "../modules/addresses/addresses.service.js";
import { replaceCartSchema } from "../modules/cart/cart.service.js";
import { quoteSchema } from "../modules/checkout/totals.js";
import { createOrderSchema } from "../modules/orders/create-order.service.js";
import { updateProfileSchema } from "../modules/me/me.service.js";
import {
  Address,
  Cart,
  Category,
  DeliveryCheck,
  DeliveryZone,
  ErrorResponse,
  Health,
  LoyaltyAccount,
  LoyaltyProgram,
  LoyaltyTransaction,
  Order,
  OrderSummary,
  Product,
  Profile,
  Promotion,
  Quote,
  Redemption,
  Reward,
  StoreSettings,
  StoreSlots,
} from "./schemas.js";

type Json = Record<string, unknown>;

const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });
const dataOf = (name: string): Json => ({
  type: "object",
  required: ["data"],
  properties: { data: ref(name) },
});
const listOf = (name: string): Json => ({
  type: "object",
  required: ["data"],
  properties: { data: { type: "array", items: ref(name) } },
});
const pagedOf = (name: string): Json => ({
  type: "object",
  required: ["data", "meta"],
  properties: {
    data: { type: "array", items: ref(name) },
    meta: ref("PageMeta"),
  },
});

const json = (schema: Json): Json => ({ "application/json": { schema } });
const ok = (description: string, schema: Json): Json => ({
  description,
  content: json(schema),
});
const error = (description: string): Json => ({ description, content: json(ref("ErrorResponse")) });

const COMMON_ERRORS = {
  "429": error("Demasiadas peticiones (cabecera Retry-After)."),
  "500": error("Error inesperado del servidor."),
};
const AUTH_ERRORS = {
  "401": error("Falta el token, no es válido o ha caducado."),
  "403": error("Cuenta desactivada o sin permiso para esta operación."),
};

const secured: Json = { security: [{ bearerAuth: [] }] };
const idParam = (description: string): Json => ({
  name: "id",
  in: "path",
  required: true,
  description,
  schema: { type: "string", format: "uuid" },
});
const pagingParams: Json[] = [
  { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
  {
    name: "pageSize",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 50, default: 10 },
  },
];

/** Cuerpos de petición: son los mismos esquemas con los que el servidor valida (forma de entrada). */
const REQUEST_SCHEMAS = {
  RedeemRewardRequest: z.object({ rewardId: z.uuid() }).strict(),
  UpdateProfileRequest: updateProfileSchema,
  CreateAddressRequest: createAddressSchema,
  UpdateAddressRequest: updateAddressSchema,
  QuoteRequest: quoteSchema,
  ReplaceCartRequest: replaceCartSchema,
  CreateOrderRequest: createOrderSchema,
};

function components() {
  const { schemas } = z.toJSONSchema(z.globalRegistry, {
    uri: (id) => `#/components/schemas/${id}`,
    io: "output",
  });
  const cleaned: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(schemas)) {
    const copy = { ...(schema as Record<string, unknown>) };
    delete copy["$schema"];
    delete copy["$id"];
    cleaned[name] = copy;
  }
  for (const [name, schema] of Object.entries(REQUEST_SCHEMAS)) {
    const copy = { ...(z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>) };
    delete copy["$schema"];
    cleaned[name] = copy;
  }
  cleaned["PageMeta"] = {
    type: "object",
    required: ["page", "pageSize", "total", "totalPages"],
    properties: {
      page: { type: "integer" },
      pageSize: { type: "integer" },
      total: { type: "integer" },
      totalPages: { type: "integer" },
    },
  };
  return cleaned;
}

/** Referencias para que TypeScript no elimine los esquemas registrados con `.meta({ id })`. */
export const REGISTERED_SCHEMAS = [
  Address,
  Category,
  DeliveryCheck,
  DeliveryZone,
  ErrorResponse,
  Health,
  LoyaltyAccount,
  LoyaltyProgram,
  LoyaltyTransaction,
  Order,
  OrderSummary,
  Product,
  Profile,
  Promotion,
  Redemption,
  Reward,
  StoreSettings,
  Cart,
  Quote,
  StoreSlots,
];

/** Documento OpenAPI 3.1 de la API v1. Es el contrato que consumen la web y la app Flutter. */
export function buildOpenApiDocument(): Json {
  return {
    openapi: "3.1.0",
    info: {
      title: "FORNO API",
      version: "1.0.0",
      description: [
        "API REST de FORNO, compartida por la web y la futura app móvil.",
        "",
        '**Formato.** Las respuestas correctas son `{ "data": … }` (y `{ "data": […], "meta": … }` en listas paginadas). Los errores son `{ "error": { "code", "message", "details?", "requestId" } }`. Los importes son cadenas decimales (`"9.50"`, IVA incluido) y las fechas, ISO 8601 en UTC.',
        "",
        "**Autenticación.** Los endpoints con candado exigen `Authorization: Bearer <access token de Supabase>`. El servidor verifica el token; nunca se confía en identificadores ni roles enviados por el cliente. Los roles y permisos salen siempre de la base de datos.",
        "",
        "**Límites.** Hay un límite de peticiones por IP y por usuario; al superarlo se responde `429 RATE_LIMITED` con `Retry-After`.",
        "",
        "Los datos de la carta, los horarios y las zonas son de demostración.",
      ].join("\n"),
    },
    servers: [{ url: "/api/v1", description: "Esta API" }],
    tags: [
      { name: "Sistema" },
      { name: "Catálogo" },
      { name: "Local" },
      { name: "Cuenta" },
      { name: "FORNO CLUB" },
      { name: "Pedidos" },
    ],
    paths: {
      "/health": {
        get: {
          tags: ["Sistema"],
          summary: "Estado del servicio",
          responses: { "200": ok("El servicio responde.", dataOf("Health")) },
        },
      },
      "/categories": {
        get: {
          tags: ["Catálogo"],
          summary: "Categorías de la carta",
          responses: { "200": ok("Categorías activas.", listOf("Category")), ...COMMON_ERRORS },
        },
      },
      "/products": {
        get: {
          tags: ["Catálogo"],
          summary: "Productos de la carta",
          description:
            "Carta completa (no paginada). Los productos no disponibles se incluyen con `available: false`. El precio es el base con IVA; el importe final de un pedido lo calcula siempre el servidor.",
          parameters: [
            {
              name: "category",
              in: "query",
              description: "Slug de la categoría.",
              schema: { type: "string" },
            },
            { name: "popular", in: "query", schema: { type: "string", enum: ["true", "false"] } },
          ],
          responses: {
            "200": ok("Productos.", listOf("Product")),
            "400": error("Filtros no válidos."),
            ...COMMON_ERRORS,
          },
        },
      },
      "/products/{idOrSlug}": {
        get: {
          tags: ["Catálogo"],
          summary: "Detalle de un producto",
          parameters: [
            {
              name: "idOrSlug",
              in: "path",
              required: true,
              schema: { type: "string" },
              example: "margherita",
            },
          ],
          responses: {
            "200": ok("Producto con opciones, ingredientes y alérgenos.", dataOf("Product")),
            "404": error("No existe."),
            ...COMMON_ERRORS,
          },
        },
      },
      "/promotions": {
        get: {
          tags: ["Catálogo"],
          summary: "Promociones vigentes",
          description:
            "Solo promociones activas y dentro de fechas. `code` es el cupón público, si lo hay. Que una promoción se aplique a un pedido concreto lo decide el servidor al crearlo.",
          responses: { "200": ok("Promociones.", listOf("Promotion")), ...COMMON_ERRORS },
        },
      },
      "/store/settings": {
        get: {
          tags: ["Local"],
          summary: "Datos públicos del local",
          description:
            "Dirección, contacto, tiempos, métodos de pago, horarios y días especiales. `open` indica si está abierto ahora; `ordersPaused`, si los pedidos están en pausa.",
          responses: {
            "200": ok("Datos del local.", dataOf("StoreSettings")),
            "503": error("El local aún no está configurado."),
            ...COMMON_ERRORS,
          },
        },
      },
      "/delivery-zones": {
        get: {
          tags: ["Local"],
          summary: "Zonas de reparto",
          responses: { "200": ok("Zonas activas.", listOf("DeliveryZone")), ...COMMON_ERRORS },
        },
      },
      "/delivery-zones/check": {
        get: {
          tags: ["Local"],
          summary: "¿Se reparte en este código postal?",
          parameters: [
            {
              name: "postalCode",
              in: "query",
              required: true,
              schema: { type: "string", pattern: "^[0-9]{5}$" },
              example: "28001",
            },
          ],
          responses: {
            "200": ok("Resultado y condiciones de la zona.", dataOf("DeliveryCheck")),
            "400": error("Código postal no válido."),
            ...COMMON_ERRORS,
          },
        },
      },
      "/store/slots": {
        get: {
          tags: ["Local"],
          summary: "Franjas horarias para recoger o recibir",
          description:
            "Franjas seleccionables de una fecha (dentro del horario, con antelación suficiente) y si se puede pedir «lo antes posible» ahora. No se guarda en caché. `scheduledFor` de un pedido debe ser exactamente una de estas franjas.",
          parameters: [
            { name: "type", in: "query", schema: { type: "string", enum: ["PICKUP", "DELIVERY"] } },
            {
              name: "date",
              in: "query",
              description: "Fecha local YYYY-MM-DD; por defecto, hoy.",
              schema: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
            },
          ],
          responses: {
            "200": ok("Franjas (UTC).", dataOf("StoreSlots")),
            "400": error("Parámetros no válidos."),
            "503": error("El local aún no está configurado."),
            ...COMMON_ERRORS,
          },
        },
      },
      "/checkout/quote": {
        post: {
          tags: ["Pedidos"],
          summary: "Presupuesto del carrito",
          description:
            "Calcula en el servidor los importes que verá el cliente (líneas, IVA, envío, total y puntos estimados). Solo se envían identificadores y cantidades; cualquier precio enviado se rechaza. No requiere sesión ni guarda nada.",
          requestBody: { required: true, content: json(ref("QuoteRequest")) },
          responses: {
            "200": ok("Presupuesto.", dataOf("Quote")),
            "400": error("Datos no válidos."),
            "401": error("Se pidió un cupón o una recompensa sin sesión, o el token no es válido."),
            "422": error(
              "Producto u opción inexistente o no disponible, o cupón/recompensa no válidos (`COUPON_NOT_FOUND`, `COUPON_EXPIRED`, `COUPON_NOT_STARTED`, `COUPON_INACTIVE`, `COUPON_MIN_SUBTOTAL`, `COUPON_NOT_FIRST_ORDER`, `COUPON_USED_UP`, `COUPON_ALREADY_USED`, `COUPON_NOT_APPLICABLE`, `REDEMPTION_NOT_AVAILABLE`, `REWARD_NOT_APPLICABLE`).",
            ),
            ...COMMON_ERRORS,
          },
        },
      },
      "/cart": {
        get: {
          tags: ["Pedidos"],
          summary: "Mi carrito guardado",
          description:
            "Sincroniza el carrito entre la web y la app. Guarda qué se quiere, nunca precios.",
          ...secured,
          responses: {
            "200": ok("Carrito.", dataOf("Cart")),
            ...AUTH_ERRORS,
            ...COMMON_ERRORS,
          },
        },
        put: {
          tags: ["Pedidos"],
          summary: "Sustituir mi carrito guardado",
          description: "Los productos y opciones que ya no existan se descartan.",
          ...secured,
          requestBody: { required: true, content: json(ref("ReplaceCartRequest")) },
          responses: {
            "200": ok("Carrito guardado.", dataOf("Cart")),
            "400": error("Datos no válidos."),
            ...AUTH_ERRORS,
            ...COMMON_ERRORS,
          },
        },
      },
      "/orders": {
        post: {
          tags: ["Pedidos"],
          summary: "Crear un pedido",
          description:
            "Exige la cabecera `Idempotency-Key` (8–255 caracteres): repetir la misma petición devuelve el mismo pedido (cabecera `Idempotent-Replayed: true`) sin crear otro. El servidor recalcula precios, IVA, envío y mínimo, y valida zona, horario, franja y método de pago. Hoy solo se admite efectivo (`CASH_PICKUP` en recogida, `CASH_DELIVERY` a domicilio): el pago online llega en la fase 9. El pedido nace `NEW` con un pago de efectivo pendiente.",
          ...secured,
          parameters: [
            {
              name: "Idempotency-Key",
              in: "header",
              required: true,
              schema: { type: "string", minLength: 8, maxLength: 255 },
            },
          ],
          requestBody: { required: true, content: json(ref("CreateOrderRequest")) },
          responses: {
            "201": ok("Pedido creado.", dataOf("Order")),
            "400": error("Datos no válidos o falta `Idempotency-Key`."),
            "409": error(
              "No se puede pedir ahora: `ORDERS_PAUSED`, `STORE_CLOSED`, `ORDER_TYPE_UNAVAILABLE`, `PAYMENT_METHOD_UNAVAILABLE`, o petición idéntica en curso (`REQUEST_IN_PROGRESS`).",
            ),
            "422": error(
              "Regla de negocio: `PROFILE_INCOMPLETE`, `OUTSIDE_DELIVERY_ZONE`, `BELOW_MINIMUM_ORDER`, `INVALID_SCHEDULE`, `ADDRESS_NOT_FOUND`, `PAYMENT_METHOD_MISMATCH`, `IDEMPOTENCY_KEY_REUSED`, y los errores de producto del presupuesto.",
            ),
            ...AUTH_ERRORS,
            ...COMMON_ERRORS,
          },
        },
      },
      "/me": {
        get: {
          tags: ["Cuenta"],
          summary: "Mi perfil",
          description:
            "Crea el perfil en la primera petición. `profileComplete` es `true` cuando hay nombre de usuario y teléfono, requisito para pedir.",
          ...secured,
          responses: {
            "200": ok("Perfil.", dataOf("Profile")),
            "409": error("El correo ya pertenece a otra cuenta (`ACCOUNT_CONFLICT`)."),
            ...AUTH_ERRORS,
            ...COMMON_ERRORS,
          },
        },
        patch: {
          tags: ["Cuenta"],
          summary: "Editar mi perfil",
          description:
            "Solo `fullName`, `username` (3–12 caracteres), `phone` y `marketingConsent`. Cualquier otro campo se rechaza.",
          ...secured,
          requestBody: { required: true, content: json(ref("UpdateProfileRequest")) },
          responses: {
            "200": ok("Perfil actualizado.", dataOf("Profile")),
            "400": error("Datos no válidos."),
            ...AUTH_ERRORS,
            ...COMMON_ERRORS,
          },
        },
      },
      "/me/addresses": {
        get: {
          tags: ["Cuenta"],
          summary: "Mis direcciones",
          ...secured,
          responses: {
            "200": ok("Direcciones (la predeterminada primero).", listOf("Address")),
            ...AUTH_ERRORS,
            ...COMMON_ERRORS,
          },
        },
        post: {
          tags: ["Cuenta"],
          summary: "Añadir una dirección",
          description: "Máximo 10. La primera es la predeterminada.",
          ...secured,
          requestBody: { required: true, content: json(ref("CreateAddressRequest")) },
          responses: {
            "201": ok("Dirección creada.", dataOf("Address")),
            "400": error("Datos no válidos."),
            "409": error("Límite de direcciones alcanzado."),
            ...AUTH_ERRORS,
            ...COMMON_ERRORS,
          },
        },
      },
      "/me/addresses/{id}": {
        patch: {
          tags: ["Cuenta"],
          summary: "Editar una dirección",
          ...secured,
          parameters: [idParam("Identificador de la dirección.")],
          requestBody: { required: true, content: json(ref("UpdateAddressRequest")) },
          responses: {
            "200": ok("Dirección actualizada.", dataOf("Address")),
            "400": error("Datos no válidos."),
            "404": error("No existe o es de otra persona."),
            ...AUTH_ERRORS,
            ...COMMON_ERRORS,
          },
        },
        delete: {
          tags: ["Cuenta"],
          summary: "Eliminar una dirección",
          ...secured,
          parameters: [idParam("Identificador de la dirección.")],
          responses: {
            "204": { description: "Eliminada." },
            "404": error("No existe o es de otra persona."),
            ...AUTH_ERRORS,
            ...COMMON_ERRORS,
          },
        },
      },
      "/loyalty/account": {
        get: {
          tags: ["FORNO CLUB"],
          summary: "Mi saldo de puntos",
          ...secured,
          responses: {
            "200": ok("Saldo y progreso hacia la siguiente recompensa.", dataOf("LoyaltyAccount")),
            ...AUTH_ERRORS,
            ...COMMON_ERRORS,
          },
        },
      },
      "/loyalty/transactions": {
        get: {
          tags: ["FORNO CLUB"],
          summary: "Mis movimientos de puntos",
          ...secured,
          parameters: pagingParams,
          responses: {
            "200": ok(
              "Movimientos, del más reciente al más antiguo.",
              pagedOf("LoyaltyTransaction"),
            ),
            ...AUTH_ERRORS,
            ...COMMON_ERRORS,
          },
        },
      },
      "/loyalty/rewards": {
        get: {
          tags: ["FORNO CLUB"],
          summary: "Recompensas disponibles",
          ...secured,
          responses: {
            "200": ok("Recompensas activas.", listOf("Reward")),
            ...AUTH_ERRORS,
            ...COMMON_ERRORS,
          },
        },
      },
      "/orders/me": {
        get: {
          tags: ["Pedidos"],
          summary: "Mis pedidos",
          ...secured,
          parameters: pagingParams,
          responses: {
            "200": ok("Pedidos propios, del más reciente al más antiguo.", pagedOf("OrderSummary")),
            ...AUTH_ERRORS,
            ...COMMON_ERRORS,
          },
        },
      },
      "/loyalty/program": {
        get: {
          tags: ["FORNO CLUB"],
          summary: "Programa FORNO CLUB (público)",
          description:
            "Regla de conversión de puntos, caducidad y recompensas disponibles. No requiere sesión.",
          responses: { "200": ok("Programa.", dataOf("LoyaltyProgram")), ...COMMON_ERRORS },
        },
      },
      "/loyalty/redemptions": {
        get: {
          tags: ["FORNO CLUB"],
          summary: "Mis recompensas canjeadas",
          description: "La «cartera» del cliente: recompensas disponibles, usadas o canceladas.",
          ...secured,
          parameters: [
            ...pagingParams,
            {
              name: "status",
              in: "query",
              schema: { type: "string", enum: ["AVAILABLE", "USED", "CANCELLED", "EXPIRED"] },
            },
          ],
          responses: {
            "200": ok("Recompensas canjeadas.", pagedOf("Redemption")),
            ...AUTH_ERRORS,
            ...COMMON_ERRORS,
          },
        },
        post: {
          tags: ["FORNO CLUB"],
          summary: "Canjear una recompensa",
          description:
            "Descuenta los puntos y añade la recompensa a «Mis recompensas» (estado AVAILABLE), lista para usarla en un pedido con `redemptionId`. Exige `Idempotency-Key`: un reintento no descuenta los puntos otra vez. Dos peticiones simultáneas nunca consumen los mismos puntos.",
          ...secured,
          parameters: [
            {
              name: "Idempotency-Key",
              in: "header",
              required: true,
              schema: { type: "string", minLength: 8, maxLength: 255 },
            },
          ],
          requestBody: { required: true, content: json(ref("RedeemRewardRequest")) },
          responses: {
            "201": ok("Recompensa canjeada.", dataOf("Redemption")),
            "404": error("La recompensa no existe o no está vigente."),
            "409": error(
              "`INSUFFICIENT_POINTS`, `REWARD_OUT_OF_STOCK` o petición idéntica en curso.",
            ),
            ...AUTH_ERRORS,
            ...COMMON_ERRORS,
          },
        },
      },
      "/orders/{id}/cancel": {
        post: {
          tags: ["Pedidos"],
          summary: "Cancelar mi pedido",
          description:
            "Solo mientras el local no lo haya aceptado. Se anula el pago pendiente, se devuelven los puntos gastados en una recompensa y se libera el cupón.",
          ...secured,
          parameters: [idParam("Identificador del pedido.")],
          responses: {
            "200": ok("Pedido cancelado.", dataOf("Order")),
            "404": error("No existe o es de otra persona."),
            "409": error("`CANNOT_CANCEL`: el pedido ya está en preparación."),
            ...AUTH_ERRORS,
            ...COMMON_ERRORS,
          },
        },
      },
      "/orders/{id}": {
        get: {
          tags: ["Pedidos"],
          summary: "Detalle de un pedido propio",
          description:
            "Si el pedido es de otra persona se responde 404, igual que si no existiera.",
          ...secured,
          parameters: [idParam("Identificador del pedido.")],
          responses: {
            "200": ok("Pedido con líneas, totales, pagos e historial.", dataOf("Order")),
            "404": error("No existe o es de otra persona."),
            ...AUTH_ERRORS,
            ...COMMON_ERRORS,
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Access token de Supabase Auth.",
        },
      },
      schemas: components(),
    },
  };
}
