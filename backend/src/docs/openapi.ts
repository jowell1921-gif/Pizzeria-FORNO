import { z } from "zod";

import {
  createAddressSchema,
  updateAddressSchema,
} from "../modules/addresses/addresses.service.js";
import { kitchenStatusSchema } from "../modules/kitchen/kitchen.service.js";
import { changeStatusSchema } from "../modules/orders/status.service.js";
import {
  categoryInputSchema,
  categoryPatchSchema,
  productInputSchema,
  productPatchSchema,
} from "../modules/admin/catalog-admin.service.js";
import {
  adjustmentSchema,
  loyaltySettingsSchema,
  rewardPatchSchema,
  rewardSchema,
} from "../modules/admin/loyalty-admin.service.js";
import {
  couponPatchSchema,
  couponSchema,
  promotionPatchSchema,
  promotionSchema,
} from "../modules/admin/promotions-admin.service.js";
import {
  openingHoursSchema,
  specialDaySchema,
  storeSettingsPatchSchema,
  zoneInputSchema,
  zonePatchSchema,
} from "../modules/admin/store-admin.service.js";
import { replaceCartSchema } from "../modules/cart/cart.service.js";
import { quoteSchema } from "../modules/checkout/totals.js";
import { createOrderSchema } from "../modules/orders/create-order.service.js";
import { updateProfileSchema } from "../modules/me/me.service.js";
import {
  AdminOrder,
  AdminOrderSummary,
  Address,
  Cart,
  Dashboard,
  KitchenOrder,
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
import { chatRequestSchema } from "../modules/assistant/assistant.service.js";
import { invoiceRequestSchema } from "../modules/documents/invoice.service.js";
import { refundSchema } from "../modules/payments/payment.service.js";
import { ADMIN_SCHEMAS } from "./schemas-admin.js";

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
  AssistantChatRequest: chatRequestSchema,
  RefundRequest: refundSchema,
  InvoiceRequest: invoiceRequestSchema,
  ChangeOrderStatusRequest: changeStatusSchema,
  KitchenStatusRequest: kitchenStatusSchema,
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
  for (const [name, schema] of Object.entries({ ...REQUEST_SCHEMAS, ...REQUESTS_8B })) {
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
  ...ADMIN_SCHEMAS,
  AdminOrder,
  AdminOrderSummary,
  Dashboard,
  KitchenOrder,
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

// ───────────────────────────── Administración (fase 8B) ─────────────────────────────

const REQUESTS_8B = {
  ProductRequest: productInputSchema,
  ProductPatchRequest: productPatchSchema,
  CategoryRequest: categoryInputSchema,
  CategoryPatchRequest: categoryPatchSchema,
  StoreSettingsPatchRequest: storeSettingsPatchSchema,
  OpeningHoursRequest: openingHoursSchema,
  SpecialDayRequest: specialDaySchema,
  ZoneRequest: zoneInputSchema,
  ZonePatchRequest: zonePatchSchema,
  PromotionRequest: promotionSchema,
  PromotionPatchRequest: promotionPatchSchema,
  CouponRequest: couponSchema,
  CouponPatchRequest: couponPatchSchema,
  LoyaltySettingsRequest: loyaltySettingsSchema,
  RewardRequest: rewardSchema,
  RewardPatchRequest: rewardPatchSchema,
  PointsAdjustmentRequest: adjustmentSchema,
};

const body = (name: string): Json => ({ required: true, content: json(ref(name)) });
const idPath = (description: string): Json[] => [idParam(description)];

/** Respuestas habituales de una escritura de administración. */
const WRITE_ERRORS = {
  "400": error("Datos no válidos."),
  "404": error("No existe."),
  "409": error("Conflicto con el estado actual."),
  "422": error("Regla de negocio no cumplida."),
  ...AUTH_ERRORS,
  ...COMMON_ERRORS,
};

interface CrudOptions {
  tag: string;
  path: string;
  noun: string;
  schema: string;
  permission: string;
  request: string;
  patchRequest?: string;
  withGet?: boolean;
  deletes?: boolean;
}

/** Documenta lista, creación, detalle, edición y borrado de un recurso de administración. */
function crud(o: CrudOptions): Record<string, Json> {
  const perm = `Permiso \`${o.permission}\`.`;
  const collection: Json = {
    get: {
      tags: [o.tag],
      summary: `Listar ${o.noun}`,
      description: perm,
      ...secured,
      responses: { "200": ok("Lista.", listOf(o.schema)), ...AUTH_ERRORS, ...COMMON_ERRORS },
    },
    post: {
      tags: [o.tag],
      summary: `Crear ${o.noun}`,
      description: `${perm} Cada escritura queda en el registro de auditoría.`,
      ...secured,
      requestBody: body(o.request),
      responses: { "201": ok("Creado.", dataOf(o.schema)), ...WRITE_ERRORS },
    },
  };
  const item: Json = {};
  if (o.withGet) {
    item["get"] = {
      tags: [o.tag],
      summary: `Detalle de ${o.noun}`,
      description: perm,
      ...secured,
      parameters: idPath("Identificador."),
      responses: { "200": ok("Detalle.", dataOf(o.schema)), ...WRITE_ERRORS },
    };
  }
  if (o.patchRequest) {
    item["patch"] = {
      tags: [o.tag],
      summary: `Editar ${o.noun}`,
      description: `${perm} Solo cambian los campos enviados; los demás no se tocan.`,
      ...secured,
      parameters: idPath("Identificador."),
      requestBody: body(o.patchRequest),
      responses: { "200": ok("Actualizado.", dataOf(o.schema)), ...WRITE_ERRORS },
    };
  }
  if (o.deletes) {
    item["delete"] = {
      tags: [o.tag],
      summary: `Eliminar ${o.noun}`,
      description: `${perm} Borrado lógico cuando hay historial que conservar.`,
      ...secured,
      parameters: idPath("Identificador."),
      responses: { "204": { description: "Eliminado." }, ...WRITE_ERRORS },
    };
  }
  return {
    [o.path]: collection,
    ...(Object.keys(item).length > 0 ? { [`${o.path}/{id}`]: item } : {}),
  };
}

const settingsOperation = (
  summary: string,
  schema: string,
  permission: string,
  patch?: string,
): Json => ({
  get: {
    tags: ["Configuración"],
    summary,
    description: `Permiso \`${permission}\`.`,
    ...secured,
    responses: { "200": ok(summary, dataOf(schema)), ...AUTH_ERRORS, ...COMMON_ERRORS },
  },
  ...(patch
    ? {
        patch: {
          tags: ["Configuración"],
          summary: `Editar: ${summary.toLowerCase()}`,
          description: `Permiso \`${permission}\`. Solo cambian los campos enviados. Queda en la auditoría.`,
          ...secured,
          requestBody: body(patch),
          responses: { "200": ok("Actualizado.", dataOf(schema)), ...WRITE_ERRORS },
        },
      }
    : {}),
});

const pagedGet = (
  tag: string,
  summary: string,
  permission: string,
  schema: string,
  extra: Json[] = [],
): Json => ({
  get: {
    tags: [tag],
    summary,
    description: `Permiso \`${permission}\`.`,
    ...secured,
    parameters: [...pagingParams, ...extra],
    responses: {
      "200": ok("Página de resultados.", pagedOf(schema)),
      "400": error("Filtros no válidos."),
      ...AUTH_ERRORS,
      ...COMMON_ERRORS,
    },
  },
});

const queryParam = (name: string, description: string): Json => ({
  name,
  in: "query",
  description,
  schema: { type: "string" },
});

function adminPaths(): Record<string, Json> {
  return {
    ...crud({
      tag: "Carta (admin)",
      path: "/admin/categories",
      noun: "categorías",
      schema: "AdminCategory",
      permission: "catalog:manage",
      request: "CategoryRequest",
      patchRequest: "CategoryPatchRequest",
      deletes: true,
    }),
    ...crud({
      tag: "Carta (admin)",
      path: "/admin/products",
      noun: "productos",
      schema: "AdminProduct",
      permission: "catalog:manage",
      request: "ProductRequest",
      patchRequest: "ProductPatchRequest",
      withGet: true,
      deletes: true,
    }),
    "/admin/products/{id}/restore": {
      post: {
        tags: ["Carta (admin)"],
        summary: "Restaurar un producto eliminado",
        description: "Permiso `catalog:manage`.",
        ...secured,
        parameters: idPath("Identificador del producto."),
        responses: { "200": ok("Restaurado.", dataOf("AdminProduct")), ...WRITE_ERRORS },
      },
    },
    "/admin/allergens": {
      get: {
        tags: ["Carta (admin)"],
        summary: "Alérgenos disponibles",
        description: "Permiso `catalog:manage`.",
        ...secured,
        responses: {
          "200": ok("Alérgenos.", listOf("AdminAllergen")),
          ...AUTH_ERRORS,
          ...COMMON_ERRORS,
        },
      },
    },
    "/admin/uploads/product-image": {
      post: {
        tags: ["Carta (admin)"],
        summary: "Subir la foto de un producto",
        description:
          "Permiso `catalog:manage`. El cuerpo es la imagen en bruto (`Content-Type: image/jpeg`, `image/png` o `image/webp`, máximo 3 MB); se comprueban los bytes, no el tipo declarado. Devuelve la URL pública para usarla en `image.url` del producto. `503 STORAGE_NOT_CONFIGURED` si no hay almacenamiento configurado.",
        ...secured,
        requestBody: {
          required: true,
          content: {
            "image/webp": { schema: { type: "string", format: "binary" } },
            "image/png": { schema: { type: "string", format: "binary" } },
            "image/jpeg": { schema: { type: "string", format: "binary" } },
          },
        },
        responses: {
          "201": ok("Imagen subida.", dataOf("UploadResult")),
          "400": error("`INVALID_IMAGE` o `IMAGE_REQUIRED`."),
          "413": error("Más de 3 MB."),
          "503": error("`STORAGE_NOT_CONFIGURED`."),
          ...AUTH_ERRORS,
          ...COMMON_ERRORS,
        },
      },
    },
    "/admin/store/settings": settingsOperation(
      "Datos del local",
      "AdminStoreSettings",
      "settings:manage",
      "StoreSettingsPatchRequest",
    ),
    "/admin/store/opening-hours": {
      get: {
        tags: ["Configuración"],
        summary: "Horario semanal",
        description:
          "Permiso `settings:manage`. Día ISO 1 = lunes … 7 = domingo; minutos desde las 00:00.",
        ...secured,
        responses: {
          "200": ok("Tramos.", listOf("OpeningSlot")),
          ...AUTH_ERRORS,
          ...COMMON_ERRORS,
        },
      },
      put: {
        tags: ["Configuración"],
        summary: "Sustituir el horario semanal",
        description:
          "Permiso `settings:manage`. Un día sin tramos es un día cerrado; los tramos de un día no pueden solaparse.",
        ...secured,
        requestBody: body("OpeningHoursRequest"),
        responses: { "200": ok("Horario guardado.", listOf("OpeningSlot")), ...WRITE_ERRORS },
      },
    },
    "/admin/store/special-days": {
      get: {
        tags: ["Configuración"],
        summary: "Festivos y horarios especiales",
        description: "Permiso `settings:manage`. Desde hace una semana en adelante.",
        ...secured,
        responses: {
          "200": ok("Días especiales.", listOf("SpecialDay")),
          ...AUTH_ERRORS,
          ...COMMON_ERRORS,
        },
      },
      post: {
        tags: ["Configuración"],
        summary: "Añadir un festivo u horario especial",
        description:
          "Permiso `settings:manage`. Un día especial sustituye al horario semanal de esa fecha. `409 SPECIAL_DAY_EXISTS` si ya hay uno.",
        ...secured,
        requestBody: body("SpecialDayRequest"),
        responses: { "201": ok("Creado.", dataOf("SpecialDay")), ...WRITE_ERRORS },
      },
    },
    "/admin/store/special-days/{id}": {
      delete: {
        tags: ["Configuración"],
        summary: "Quitar un día especial",
        description: "Permiso `settings:manage`.",
        ...secured,
        parameters: idPath("Identificador."),
        responses: { "204": { description: "Eliminado." }, ...WRITE_ERRORS },
      },
    },
    ...crud({
      tag: "Configuración",
      path: "/admin/delivery-zones",
      noun: "zonas de reparto",
      schema: "AdminZone",
      permission: "settings:manage",
      request: "ZoneRequest",
      patchRequest: "ZonePatchRequest",
      deletes: true,
    }),
    ...crud({
      tag: "Promociones (admin)",
      path: "/admin/promotions",
      noun: "promociones",
      schema: "AdminPromotion",
      permission: "promotions:manage",
      request: "PromotionRequest",
      patchRequest: "PromotionPatchRequest",
      withGet: true,
      deletes: true,
    }),
    "/admin/promotions/{id}/coupons": {
      post: {
        tags: ["Promociones (admin)"],
        summary: "Crear un cupón para una promoción",
        description:
          "Permiso `promotions:manage`. El código se guarda en mayúsculas; `409 COUPON_CODE_EXISTS` si ya existe. Devuelve la promoción con sus cupones.",
        ...secured,
        parameters: idPath("Identificador de la promoción."),
        requestBody: body("CouponRequest"),
        responses: {
          "201": ok("Promoción actualizada.", dataOf("AdminPromotion")),
          ...WRITE_ERRORS,
        },
      },
    },
    "/admin/coupons/{id}": {
      patch: {
        tags: ["Promociones (admin)"],
        summary: "Editar un cupón",
        description: "Permiso `promotions:manage`. El código no se cambia: se crea otro cupón.",
        ...secured,
        parameters: idPath("Identificador del cupón."),
        requestBody: body("CouponPatchRequest"),
        responses: {
          "200": ok("Promoción actualizada.", dataOf("AdminPromotion")),
          ...WRITE_ERRORS,
        },
      },
      delete: {
        tags: ["Promociones (admin)"],
        summary: "Eliminar un cupón",
        description:
          "Permiso `promotions:manage`. Un cupón ya usado no se elimina (`409 COUPON_HAS_USES`): se desactiva.",
        ...secured,
        parameters: idPath("Identificador del cupón."),
        responses: { "204": { description: "Eliminado." }, ...WRITE_ERRORS },
      },
    },
    "/admin/loyalty/settings": settingsOperation(
      "Regla de puntos de FORNEA CLUB",
      "LoyaltySettings",
      "loyalty:manage",
      "LoyaltySettingsRequest",
    ),
    ...crud({
      tag: "FORNEA CLUB (admin)",
      path: "/admin/rewards",
      noun: "recompensas",
      schema: "AdminReward",
      permission: "loyalty:manage",
      request: "RewardRequest",
      patchRequest: "RewardPatchRequest",
      deletes: true,
    }),
    "/admin/loyalty/transactions": pagedGet(
      "FORNEA CLUB (admin)",
      "Movimientos de puntos de todos los clientes",
      "loyalty:manage",
      "AdminTransaction",
      [
        {
          name: "type",
          in: "query",
          schema: {
            type: "string",
            enum: ["EARN", "REDEEM", "REVERSAL", "ADJUSTMENT", "EXPIRATION"],
          },
        },
        queryParam("userId", "Identificador del cliente."),
        queryParam("q", "Nombre o correo del cliente."),
      ],
    ),
    "/admin/loyalty/redemptions": pagedGet(
      "FORNEA CLUB (admin)",
      "Recompensas canjeadas por los clientes",
      "loyalty:manage",
      "AdminRedemption",
      [
        {
          name: "status",
          in: "query",
          schema: { type: "string", enum: ["AVAILABLE", "USED", "CANCELLED", "EXPIRED"] },
        },
      ],
    ),
    "/admin/loyalty/adjustments": {
      post: {
        tags: ["FORNEA CLUB (admin)"],
        summary: "Ajustar los puntos de un cliente",
        description:
          "Permiso `loyalty:manage`. Exige un motivo; queda en el libro de movimientos y en la auditoría. Nunca se edita el saldo directamente ni puede quedar negativo (`409 INSUFFICIENT_POINTS`).",
        ...secured,
        requestBody: body("PointsAdjustmentRequest"),
        responses: { "201": ok("Ajuste registrado.", dataOf("PointsAdjustment")), ...WRITE_ERRORS },
      },
    },
    "/admin/customers": pagedGet(
      "FORNEA CLUB (admin)",
      "Clientes con su saldo de puntos",
      "customers:read",
      "Customer",
      [queryParam("q", "Nombre, usuario, correo o teléfono.")],
    ),
    "/admin/audit": pagedGet("Configuración", "Registro de auditoría", "audit:read", "AuditEntry", [
      queryParam("entityType", "Tipo de entidad (Product, Order…)."),
      queryParam("action", "Prefijo de la acción (product., store.…)."),
      queryParam("actorId", "Quién lo hizo."),
      queryParam("entityId", "Identificador de la entidad."),
    ]),
  };
}

// ───────────────────────────── Pagos, correos y documentos (fase 9) ─────────────────────────────

const pdfResponse = (description: string): Json => ({
  description,
  content: { "application/pdf": { schema: { type: "string", format: "binary" } } },
});

function paymentPaths(): Record<string, Json> {
  return {
    "/orders/{id}/payment-session": {
      post: {
        tags: ["Pagos"],
        summary: "Iniciar el pago online de un pedido",
        description:
          "Crea (o reutiliza, si sigue abierta) la sesión de pago de Stripe de un pedido «pendiente de pago» y devuelve la URL a la que enviar al cliente. Volver de esa página NO confirma el pago: el pedido solo pasa a «nuevo» cuando llega el evento verificado de Stripe.",
        ...secured,
        parameters: [idParam("Identificador del pedido.")],
        responses: {
          "200": ok("URL de pago.", dataOf("PaymentSession")),
          "404": error("No existe o es de otra persona."),
          "409": error("`ORDER_NOT_PAYABLE`, `PAYMENT_IN_PROGRESS` o `PAYMENTS_NOT_CONFIGURED`."),
          "502": error("`PAYMENT_PROVIDER_ERROR`: Stripe no está disponible."),
          ...AUTH_ERRORS,
          ...COMMON_ERRORS,
        },
      },
    },
    "/orders/{id}/documents": {
      get: {
        tags: ["Pagos"],
        summary: "Tickets y facturas de mi pedido",
        description: "`settled` indica si el pedido ya está cobrado (y se puede pedir el ticket).",
        ...secured,
        parameters: [idParam("Identificador del pedido.")],
        responses: {
          "200": ok("Documentos emitidos.", dataOf("OrderDocuments")),
          "404": error("No existe o es de otra persona."),
          ...AUTH_ERRORS,
          ...COMMON_ERRORS,
        },
      },
    },
    "/orders/{id}/documents/{type}": {
      get: {
        tags: ["Pagos"],
        summary: "Descargar el ticket o la factura (PDF)",
        description:
          "`type` es `ticket` o `invoice`. El ticket se emite al pedirlo si el pedido está cobrado; la factura debe haberse solicitado antes.",
        ...secured,
        parameters: [
          idParam("Identificador del pedido."),
          { name: "type", in: "path", required: true, schema: { enum: ["ticket", "invoice"] } },
        ],
        responses: {
          "200": pdfResponse("Documento en PDF."),
          "404": error("No existe o es de otra persona."),
          "409": error("`DOCUMENT_NOT_AVAILABLE`: el pedido aún no está cobrado."),
          ...AUTH_ERRORS,
          ...COMMON_ERRORS,
        },
      },
    },
    "/orders/{id}/invoice": {
      post: {
        tags: ["Pagos"],
        summary: "Solicitar la factura de mi pedido",
        description:
          "Emite la factura con los datos fiscales del cliente (una por pedido; repetir la petición devuelve la misma). Solo con el pedido cobrado.",
        ...secured,
        parameters: [idParam("Identificador del pedido.")],
        requestBody: { required: true, content: json(ref("InvoiceRequest")) },
        responses: {
          "201": ok("Factura emitida.", dataOf("DocumentInfo")),
          "400": error("Datos no válidos."),
          "404": error("No existe o es de otra persona."),
          "409": error("`DOCUMENT_NOT_AVAILABLE`: el pedido aún no está cobrado."),
          ...AUTH_ERRORS,
          ...COMMON_ERRORS,
        },
      },
    },
    "/webhooks/stripe": {
      post: {
        tags: ["Pagos"],
        summary: "Webhook de Stripe",
        description:
          "Lo llama Stripe, no los clientes. Verifica la firma (`Stripe-Signature`) sobre el cuerpo exacto; sin firma válida responde 400 y no hace nada. Es idempotente: cada evento se procesa una sola vez. Solo existe si Stripe está configurado.",
        responses: {
          "200": { description: "Evento recibido (procesado, duplicado o ignorado)." },
          "400": error("`INVALID_SIGNATURE`."),
          "500": error("Fallo al procesar: Stripe lo reintentará."),
        },
      },
    },
    "/admin/orders/{id}/refund": {
      post: {
        tags: ["Pagos"],
        summary: "Reembolsar un pago online",
        description:
          "Permiso `payments:refund`. Devuelve todo lo pendiente o un importe parcial; con motivo obligatorio y registro de auditoría. Repetir la misma petición no devuelve dos veces.",
        ...secured,
        parameters: [idParam("Identificador del pedido.")],
        requestBody: { required: true, content: json(ref("RefundRequest")) },
        responses: {
          "200": ok("Pedido con el pago actualizado.", dataOf("AdminOrder")),
          "404": error("No hay un pago online cobrado que devolver."),
          "422": error("`INVALID_REFUND_AMOUNT`: supera lo que se puede devolver."),
          "502": error("`PAYMENT_PROVIDER_ERROR`."),
          ...AUTH_ERRORS,
          ...COMMON_ERRORS,
        },
      },
    },
    "/admin/orders/{id}/documents/{type}": {
      get: {
        tags: ["Pagos"],
        summary: "Ticket o factura de un pedido (PDF)",
        description: "Permiso `orders:read:all`.",
        ...secured,
        parameters: [
          idParam("Identificador del pedido."),
          { name: "type", in: "path", required: true, schema: { enum: ["ticket", "invoice"] } },
        ],
        responses: {
          "200": pdfResponse("Documento en PDF."),
          "404": error("No existe."),
          "409": error("`DOCUMENT_NOT_AVAILABLE`."),
          ...AUTH_ERRORS,
          ...COMMON_ERRORS,
        },
      },
    },
    "/admin/notifications": pagedGet(
      "Pagos",
      "Correos de pedido",
      "settings:manage",
      "AdminNotification",
      [
        queryParam("status", "PENDING, SENT, FAILED o LOGGED (registrado sin enviar)."),
        queryParam("template", "Plantilla (ORDER_CONFIRMED, ORDER_READY…)."),
        queryParam("q", "Parte del correo del destinatario."),
      ],
    ),
  };
}

/** Documento OpenAPI 3.1 de la API v1. Es el contrato que consumen la web y la app Flutter. */
function buildBaseDocument(): Json {
  return {
    openapi: "3.1.0",
    info: {
      title: "FORNEA API",
      version: "1.0.0",
      description: [
        "API REST de FORNEA, compartida por la web y la futura app móvil.",
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
      { name: "FORNEA CLUB" },
      { name: "Pedidos" },
      { name: "Personal" },
      { name: "Cocina" },
      { name: "Asistente" },
      { name: "Pagos" },
      { name: "Carta (admin)" },
      { name: "Configuración" },
      { name: "Promociones (admin)" },
      { name: "FORNEA CLUB (admin)" },
    ],
    paths: {
      "/health": {
        get: {
          tags: ["Sistema"],
          summary: "Estado del servicio",
          responses: { "200": ok("El servicio responde.", dataOf("Health")) },
        },
      },
      "/assistant/status": {
        get: {
          tags: ["Asistente"],
          summary: "¿Está disponible PizzAI con IA?",
          description:
            "`available: false` significa que el servidor no tiene proveedor de IA configurado: los clientes deben usar el modo de demostración y decirlo.",
          responses: {
            "200": ok("Estado del asistente.", dataOf("AssistantStatus")),
            ...COMMON_ERRORS,
          },
        },
      },
      "/assistant/chat": {
        post: {
          tags: ["Asistente"],
          summary: "Conversar con PizzAI",
          description:
            "Público. Se envía la conversación (hasta 12 mensajes de 500 caracteres; el último, del usuario) y se recibe la respuesta de la IA. El asistente solo conoce los datos públicos de la carta, las promociones, el reparto y FORNEA CLUB; no accede a clientes ni pedidos y no puede hacer operaciones. Límites: 20 mensajes por IP cada 10 minutos y un tope diario global.",
          requestBody: { required: true, content: json(ref("AssistantChatRequest")) },
          responses: {
            "200": ok("Respuesta (texto plano) y enlaces útiles.", dataOf("AssistantAnswer")),
            "400": error("Conversación no válida."),
            "502": error("`ASSISTANT_ERROR`: el proveedor de IA falló."),
            "503": error("`ASSISTANT_NOT_CONFIGURED` o `ASSISTANT_BUSY`."),
            ...COMMON_ERRORS,
            "429": error("`RATE_LIMITED` (por IP) o `ASSISTANT_LIMIT_REACHED` (tope diario)."),
          },
        },
      },
      "/health/ready": {
        get: {
          tags: ["Sistema"],
          summary: "Disponibilidad (con base de datos)",
          description:
            "Como `/health`, pero comprueba también la conexión con la base de datos. Para monitores de disponibilidad, no para reinicios.",
          responses: {
            "200": ok("Servicio y base de datos disponibles.", dataOf("Health")),
            "503": error("`NOT_READY`: la base de datos no responde."),
          },
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
            "Exige la cabecera `Idempotency-Key` (8–255 caracteres): repetir la misma petición devuelve el mismo pedido (cabecera `Idempotent-Replayed: true`) sin crear otro. El servidor recalcula precios, IVA, envío y mínimo, y valida zona, horario, franja y método de pago. Métodos de pago: efectivo (`CASH_PICKUP` en recogida, `CASH_DELIVERY` a domicilio) y, solo si la pasarela está configurada, `ONLINE` (`/store/settings` anuncia los disponibles). En efectivo el pedido nace `NEW` con un cobro pendiente; con `ONLINE` nace `PENDING_PAYMENT` y se inicia el pago con `POST /orders/{id}/payment-session`: solo el webhook verificado de Stripe lo pasa a `NEW`.",
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
      "/me/admin-role": {
        put: {
          tags: ["Cuenta"],
          summary: "Hacerme administrador (solo demostración)",
          description:
            "Concede el rol ADMIN al propio usuario. Está activo por defecto (web de demostración); con SELF_ADMIN_ENABLED=false responde 403 SELF_ADMIN_DISABLED. Queda en la auditoría.",
          ...secured,
          responses: {
            "200": ok("Perfil actualizado.", dataOf("Profile")),
            ...AUTH_ERRORS,
            ...COMMON_ERRORS,
            "403": error("Sin permiso, o no disponible en este entorno (`SELF_ADMIN_DISABLED`)."),
          },
        },
        delete: {
          tags: ["Cuenta"],
          summary: "Dejar de ser administrador (solo demostración)",
          description:
            "Quita el rol ADMIN al propio usuario. Mismas condiciones que la operación anterior.",
          ...secured,
          responses: {
            "200": ok("Perfil actualizado.", dataOf("Profile")),
            ...AUTH_ERRORS,
            ...COMMON_ERRORS,
            "403": error("Sin permiso, o no disponible en este entorno (`SELF_ADMIN_DISABLED`)."),
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
          tags: ["FORNEA CLUB"],
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
          tags: ["FORNEA CLUB"],
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
          tags: ["FORNEA CLUB"],
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
      "/admin/dashboard": {
        get: {
          tags: ["Personal"],
          summary: "Panel de control del día",
          description:
            "Pedidos de hoy (en la zona horaria del local) por estado, ventas, productos más pedidos de los últimos 7 días y últimos pedidos. Permiso `dashboard:read`.",
          ...secured,
          responses: {
            "200": ok("Resumen.", dataOf("Dashboard")),
            ...AUTH_ERRORS,
            ...COMMON_ERRORS,
          },
        },
      },
      "/admin/orders": {
        get: {
          tags: ["Personal"],
          summary: "Pedidos (personal)",
          description:
            "Con filtros y paginación, del más reciente al más antiguo. Permiso `orders:read:all`. El método de pago solo se incluye con `payments:read`.",
          ...secured,
          parameters: [
            ...pagingParams,
            {
              name: "status",
              in: "query",
              description: "Uno o varios estados separados por comas.",
              schema: { type: "string" },
            },
            { name: "type", in: "query", schema: { type: "string", enum: ["PICKUP", "DELIVERY"] } },
            {
              name: "date",
              in: "query",
              description: "Día del pedido (YYYY-MM-DD, hora del local).",
              schema: { type: "string" },
            },
            {
              name: "q",
              in: "query",
              description: "Número de pedido, nombre o correo del cliente.",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": ok("Pedidos.", pagedOf("AdminOrderSummary")),
            "400": error("Filtros no válidos."),
            ...AUTH_ERRORS,
            ...COMMON_ERRORS,
          },
        },
      },
      "/admin/orders/{id}": {
        get: {
          tags: ["Personal"],
          summary: "Detalle de un pedido (personal)",
          description:
            "Cliente, dirección, líneas, importes, pagos, historial y los estados a los que se puede pasar (`allowedNext`).",
          ...secured,
          parameters: [idParam("Identificador del pedido.")],
          responses: {
            "200": ok("Pedido.", dataOf("AdminOrder")),
            "404": error("No existe."),
            ...AUTH_ERRORS,
            ...COMMON_ERRORS,
          },
        },
      },
      "/admin/orders/{id}/status": {
        patch: {
          tags: ["Personal"],
          summary: "Cambiar el estado de un pedido",
          description:
            "Solo transiciones válidas (`409 INVALID_TRANSITION` si no). Rechazar y devolver un pedido completado exigen `reason`. Al completar se conceden los puntos; al rechazar o cancelar se revierten. Queda en el historial y en la auditoría. Permiso `orders:update-status`.",
          ...secured,
          parameters: [idParam("Identificador del pedido.")],
          requestBody: { required: true, content: json(ref("ChangeOrderStatusRequest")) },
          responses: {
            "200": ok("Pedido actualizado.", dataOf("AdminOrder")),
            "400": error("Datos no válidos."),
            "404": error("No existe."),
            "409": error("`INVALID_TRANSITION`."),
            "422": error("`REASON_REQUIRED`."),
            ...AUTH_ERRORS,
            ...COMMON_ERRORS,
          },
        },
      },
      "/admin/stream": {
        get: {
          tags: ["Personal"],
          summary: "Avisos en directo de pedidos (SSE)",
          description:
            "Flujo `text/event-stream`: cada cambio de pedido emite `event: order` con `{ kind, orderId, orderNumber, status }` (sin datos personales). Se consume con `fetch` para poder enviar `Authorization`. Se cierra a los 15 minutos: hay que reconectar con un token renovado. Permiso `orders:read:all`.",
          ...secured,
          responses: {
            "200": {
              description: "Flujo de eventos.",
              content: { "text/event-stream": { schema: { type: "string" } } },
            },
            ...AUTH_ERRORS,
          },
        },
      },
      "/kitchen/orders": {
        get: {
          tags: ["Cocina"],
          summary: "Pedidos de la pantalla de cocina",
          description:
            "Pedidos en curso y los completados en las últimas 3 horas. Solo lo necesario para preparar: **sin datos del cliente, importes ni pagos**. Permiso `kitchen:orders:read`.",
          ...secured,
          responses: {
            "200": ok("Pedidos.", listOf("KitchenOrder")),
            ...AUTH_ERRORS,
            ...COMMON_ERRORS,
          },
        },
      },
      "/kitchen/orders/{id}/status": {
        patch: {
          tags: ["Cocina"],
          summary: "Avanzar un pedido desde la cocina",
          description:
            "La cocina solo puede aceptar, preparar, marcar listo y entregar (recogida). No puede rechazar, cancelar, sacar a reparto ni saltarse pasos (`403 KITCHEN_TRANSITION_NOT_ALLOWED`). Permiso `kitchen:orders:update-status`.",
          ...secured,
          parameters: [idParam("Identificador del pedido.")],
          requestBody: { required: true, content: json(ref("KitchenStatusRequest")) },
          responses: {
            "200": ok("Pedido actualizado.", dataOf("KitchenOrder")),
            "400": error("Datos no válidos."),
            "404": error("No existe."),
            ...AUTH_ERRORS,
            ...COMMON_ERRORS,
          },
        },
      },
      "/kitchen/stream": {
        get: {
          tags: ["Cocina"],
          summary: "Avisos en directo de pedidos (SSE)",
          description: "Igual que `/admin/stream`, con el permiso `kitchen:orders:read`.",
          ...secured,
          responses: {
            "200": {
              description: "Flujo de eventos.",
              content: { "text/event-stream": { schema: { type: "string" } } },
            },
            ...AUTH_ERRORS,
          },
        },
      },
      ...adminPaths(),
      ...paymentPaths(),
      "/loyalty/program": {
        get: {
          tags: ["FORNEA CLUB"],
          summary: "Programa FORNEA CLUB (público)",
          description:
            "Regla de conversión de puntos, caducidad y recompensas disponibles. No requiere sesión.",
          responses: { "200": ok("Programa.", dataOf("LoyaltyProgram")), ...COMMON_ERRORS },
        },
      },
      "/loyalty/redemptions": {
        get: {
          tags: ["FORNEA CLUB"],
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
          tags: ["FORNEA CLUB"],
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

/**
 * Nombre estable de cada operación (`getProducts`, `getOrdersById`, `postOrdersByIdCancel`…), para
 * que los generadores de clientes (por ejemplo, el de Dart para Flutter) produzcan métodos con nombres
 * legibles y que no cambian entre versiones mientras la ruta no cambie.
 */
export function operationIdFor(method: string, path: string): string {
  const words = path
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      const param = /^\{(\w+)\}$/.exec(segment);
      const text = param ? `By ${param[1]}` : segment;
      return text
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join("");
    });
  return method.toLowerCase() + words.join("");
}

/** Documento OpenAPI 3.1 de la API v1 (con `operationId` en cada operación). */
export function buildOpenApiDocument(): Json {
  const document = buildBaseDocument();
  const paths = document["paths"] as Record<string, Record<string, Json>>;
  for (const [path, item] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (["get", "post", "put", "patch", "delete"].includes(method)) {
        operation["operationId"] = operationIdFor(method, path);
      }
      // Consultar estas secciones del panel exige el permiso de lectura; modificarlas, el de gestión.
      if (method === "get" && typeof operation["description"] === "string") {
        operation["description"] = operation["description"].replace(
          /`(catalog|promotions|loyalty|settings):manage`/g,
          "`$1:read`",
        );
      }
    }
  }
  return document;
}
