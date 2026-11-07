-- Reglas de integridad que Prisma no puede expresar en schema.prisma.
-- Ver docs/database/README.md para la explicación de cada bloque.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Restricciones CHECK
-- ════════════════════════════════════════════════════════════════════════════

-- Funciones auxiliares (inmutables, por eso pueden usarse en CHECK).
CREATE FUNCTION is_valid_postal_code_list(codes text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT cardinality(codes) > 0
     AND array_to_string(codes, ',') ~ '^[0-9]{5}(,[0-9]{5})*$'
$$;

-- Usuarios y direcciones
ALTER TABLE "Profile"
  ADD CONSTRAINT "ck_profile_email_lowercase" CHECK ("email" = lower("email")),
  ADD CONSTRAINT "ck_profile_email_format" CHECK ("email" ~ '^[^@[:space:]]+@[^@[:space:]]+$');

ALTER TABLE "Address"
  ADD CONSTRAINT "ck_address_country" CHECK ("country" ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT "ck_address_postal_code" CHECK (char_length(btrim("postalCode")) > 0),
  ADD CONSTRAINT "ck_address_line1" CHECK (char_length(btrim("line1")) > 0);

-- Catálogo
ALTER TABLE "Category"
  ADD CONSTRAINT "ck_category_slug" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

ALTER TABLE "Product"
  ADD CONSTRAINT "ck_product_slug" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT "ck_product_base_price" CHECK ("basePrice" >= 0),
  ADD CONSTRAINT "ck_product_tax_rate" CHECK ("taxRate" >= 0 AND "taxRate" <= 100);

ALTER TABLE "OptionGroup"
  ADD CONSTRAINT "ck_option_group_select" CHECK (
    "minSelect" >= 0 AND "maxSelect" >= 1 AND "maxSelect" >= "minSelect"
  ),
  ADD CONSTRAINT "ck_option_group_required" CHECK (NOT "required" OR "minSelect" >= 1);

ALTER TABLE "CartItem"
  ADD CONSTRAINT "ck_cart_item_quantity" CHECK ("quantity" > 0);

-- Tienda y reparto
ALTER TABLE "StoreSettings"
  ADD CONSTRAINT "ck_store_settings_singleton" CHECK ("id" = 1),
  ADD CONSTRAINT "ck_store_settings_times" CHECK ("prepTimeMinutes" >= 0 AND "deliveryTimeMinutes" >= 0),
  ADD CONSTRAINT "ck_store_settings_slots" CHECK ("slotMinutes" > 0 AND "maxAdvanceDays" >= 0),
  ADD CONSTRAINT "ck_store_settings_loyalty" CHECK (
    "loyaltyPointsPerEuro" >= 0 AND ("loyaltyExpiryDays" IS NULL OR "loyaltyExpiryDays" > 0)
  );

ALTER TABLE "OpeningHours"
  ADD CONSTRAINT "ck_opening_hours_day" CHECK ("dayOfWeek" BETWEEN 1 AND 7),
  ADD CONSTRAINT "ck_opening_hours_range" CHECK (
    "openMinute" >= 0 AND "closeMinute" <= 1440 AND "openMinute" < "closeMinute"
  );

ALTER TABLE "SpecialOpeningHours"
  ADD CONSTRAINT "ck_special_hours" CHECK (
    ("closed" AND "openMinute" IS NULL AND "closeMinute" IS NULL)
    OR (NOT "closed" AND "openMinute" IS NOT NULL AND "closeMinute" IS NOT NULL
        AND "openMinute" >= 0 AND "closeMinute" <= 1440 AND "openMinute" < "closeMinute")
  );

-- Las franjas activas de un mismo día no pueden solaparse.
ALTER TABLE "OpeningHours"
  ADD CONSTRAINT "ex_opening_hours_no_overlap" EXCLUDE USING gist (
    "dayOfWeek" WITH =,
    int4range("openMinute", "closeMinute") WITH &&
  ) WHERE ("active");

-- Un día es festivo (cerrado) o tiene franjas especiales, pero no ambas cosas ni solapadas.
ALTER TABLE "SpecialOpeningHours"
  ADD CONSTRAINT "ex_special_hours_no_overlap" EXCLUDE USING gist (
    "date" WITH =,
    int4range(COALESCE("openMinute", 0), COALESCE("closeMinute", 1440)) WITH &&
  );

ALTER TABLE "DeliveryZone"
  ADD CONSTRAINT "ck_delivery_zone_postal_codes" CHECK (is_valid_postal_code_list("postalCodes")),
  ADD CONSTRAINT "ck_delivery_zone_amounts" CHECK ("deliveryFee" >= 0 AND "minimumOrder" >= 0),
  ADD CONSTRAINT "ck_delivery_zone_minutes" CHECK ("estimatedMinutes" > 0);

-- Promociones y cupones
ALTER TABLE "Promotion"
  ADD CONSTRAINT "ck_promotion_dates" CHECK (
    "startsAt" IS NULL OR "endsAt" IS NULL OR "endsAt" > "startsAt"
  ),
  ADD CONSTRAINT "ck_promotion_discount" CHECK (
    "kind" <> 'DISCOUNT' OR (
      "discountType" IS NOT NULL AND "discountValue" IS NOT NULL AND "discountValue" > 0
      AND ("discountType" <> 'PERCENT' OR "discountValue" <= 100)
    )
  ),
  ADD CONSTRAINT "ck_promotion_combo" CHECK (
    "kind" <> 'COMBO' OR ("comboPrice" IS NOT NULL AND "comboPrice" >= 0)
  ),
  ADD CONSTRAINT "ck_promotion_limits" CHECK (
    ("minSubtotal" IS NULL OR "minSubtotal" >= 0)
    AND ("maxRedemptions" IS NULL OR "maxRedemptions" > 0)
    AND ("perUserLimit" IS NULL OR "perUserLimit" > 0)
  );

ALTER TABLE "PromotionProduct"
  ADD CONSTRAINT "ck_promotion_product_quantity" CHECK ("quantity" > 0);

ALTER TABLE "Coupon"
  ADD CONSTRAINT "ck_coupon_code" CHECK ("code" ~ '^[A-Z0-9_-]{3,32}$'),
  ADD CONSTRAINT "ck_coupon_dates" CHECK (
    "startsAt" IS NULL OR "endsAt" IS NULL OR "endsAt" > "startsAt"
  ),
  ADD CONSTRAINT "ck_coupon_limits" CHECK (
    ("maxRedemptions" IS NULL OR "maxRedemptions" > 0)
    AND ("perUserLimit" IS NULL OR "perUserLimit" > 0)
  );

-- Pedidos: coherencia económica y de datos de entrega.
ALTER TABLE "Order"
  ADD CONSTRAINT "ck_order_amounts_positive" CHECK (
    "subtotal" >= 0 AND "discountTotal" >= 0 AND "deliveryFee" >= 0
    AND "total" >= 0 AND "taxTotal" >= 0
  ),
  ADD CONSTRAINT "ck_order_total" CHECK ("total" = "subtotal" - "discountTotal" + "deliveryFee"),
  ADD CONSTRAINT "ck_order_discount_not_above_subtotal" CHECK ("discountTotal" <= "subtotal"),
  ADD CONSTRAINT "ck_order_tax_within_total" CHECK ("taxTotal" <= "total"),
  ADD CONSTRAINT "ck_order_delivery_address" CHECK (
    "type" <> 'DELIVERY' OR (
      "deliveryName" IS NOT NULL AND "deliveryLine1" IS NOT NULL
      AND "deliveryPostalCode" IS NOT NULL AND "deliveryCity" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "ck_order_pickup_no_fee" CHECK ("type" <> 'PICKUP' OR "deliveryFee" = 0),
  ADD CONSTRAINT "ck_order_cancelled_at" CHECK (
    "status" NOT IN ('CANCELLED', 'REJECTED') OR "cancelledAt" IS NOT NULL
  ),
  ADD CONSTRAINT "ck_order_completed_at" CHECK ("status" <> 'COMPLETED' OR "completedAt" IS NOT NULL);

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "ck_order_item_quantity" CHECK ("quantity" > 0),
  ADD CONSTRAINT "ck_order_item_unit_price" CHECK ("unitPrice" >= 0),
  ADD CONSTRAINT "ck_order_item_tax_rate" CHECK ("taxRate" >= 0 AND "taxRate" <= 100),
  ADD CONSTRAINT "ck_order_item_line_total" CHECK ("lineTotal" = round("unitPrice" * "quantity", 2)),
  -- IVA contenido en un precio con IVA incluido: total * tasa / (100 + tasa), con tolerancia de 1 céntimo.
  ADD CONSTRAINT "ck_order_item_tax_amount" CHECK (
    "taxAmount" >= 0 AND "taxAmount" <= "lineTotal"
    AND abs("taxAmount" - round("lineTotal" * "taxRate" / (100 + "taxRate"), 2)) <= 0.01
  );

ALTER TABLE "OrderDiscount"
  ADD CONSTRAINT "ck_order_discount_amount" CHECK ("amount" > 0);

-- Pagos: los estados de efectivo y de pago online no se mezclan.
ALTER TABLE "Payment"
  ADD CONSTRAINT "ck_payment_amount" CHECK ("amount" > 0),
  ADD CONSTRAINT "ck_payment_refund" CHECK ("refundedAmount" >= 0 AND "refundedAmount" <= "amount"),
  ADD CONSTRAINT "ck_payment_refund_status" CHECK (
    ("status" <> 'REFUNDED' OR "refundedAmount" = "amount")
    AND ("status" <> 'PARTIALLY_REFUNDED' OR ("refundedAmount" > 0 AND "refundedAmount" < "amount"))
  ),
  ADD CONSTRAINT "ck_payment_online_provider" CHECK ("method" <> 'ONLINE' OR "provider" IS NOT NULL),
  ADD CONSTRAINT "ck_payment_cash_statuses" CHECK (
    "method" = 'ONLINE' OR "status" NOT IN ('PAID', 'PENDING', 'FAILED')
  ),
  ADD CONSTRAINT "ck_payment_online_statuses" CHECK (
    "method" <> 'ONLINE' OR "status" NOT IN ('CASH_PENDING', 'CASH_COLLECTED')
  ),
  ADD CONSTRAINT "ck_payment_paid_at" CHECK (
    "status" NOT IN ('PAID', 'CASH_COLLECTED') OR "paidAt" IS NOT NULL
  );

-- Facturación
ALTER TABLE "Invoice"
  ADD CONSTRAINT "ck_invoice_year" CHECK ("year" BETWEEN 2000 AND 2100),
  ADD CONSTRAINT "ck_invoice_number" CHECK ("number" > 0),
  ADD CONSTRAINT "ck_invoice_number_format" CHECK (
    "invoiceNumber" = "series" || '-' || "year"::text || '-' || lpad("number"::text, 6, '0')
  ),
  ADD CONSTRAINT "ck_invoice_amounts" CHECK (
    "netTotal" >= 0 AND "taxTotal" >= 0 AND "total" = "netTotal" + "taxTotal"
  );

ALTER TABLE "InvoiceSequence"
  ADD CONSTRAINT "ck_invoice_sequence_last" CHECK ("lastNumber" >= 0);

-- Fidelización
ALTER TABLE "LoyaltyAccount"
  ADD CONSTRAINT "ck_loyalty_account_balance" CHECK ("balance" >= 0 AND "lifetimeEarned" >= 0);

ALTER TABLE "LoyaltyTransaction"
  ADD CONSTRAINT "ck_loyalty_tx_points" CHECK ("points" <> 0),
  ADD CONSTRAINT "ck_loyalty_tx_sign" CHECK (
    ("type" = 'EARN' AND "points" > 0)
    OR ("type" IN ('REDEEM', 'EXPIRATION') AND "points" < 0)
    OR "type" IN ('REVERSAL', 'ADJUSTMENT')
  ),
  ADD CONSTRAINT "ck_loyalty_tx_adjustment" CHECK (
    "type" <> 'ADJUSTMENT'
    OR ("reason" IS NOT NULL AND char_length(btrim("reason")) > 0 AND "createdById" IS NOT NULL)
  ),
  ADD CONSTRAINT "ck_loyalty_tx_earn_order" CHECK ("type" <> 'EARN' OR "orderId" IS NOT NULL),
  ADD CONSTRAINT "ck_loyalty_tx_redeem_redemption" CHECK (
    "type" <> 'REDEEM' OR "redemptionId" IS NOT NULL
  ),
  ADD CONSTRAINT "ck_loyalty_tx_reversal_target" CHECK (
    "type" <> 'REVERSAL' OR "orderId" IS NOT NULL OR "redemptionId" IS NOT NULL
  );

ALTER TABLE "Reward"
  ADD CONSTRAINT "ck_reward_cost" CHECK ("pointsCost" > 0),
  ADD CONSTRAINT "ck_reward_benefit" CHECK (num_nonnulls("freeProductId", "discountAmount") = 1),
  ADD CONSTRAINT "ck_reward_discount" CHECK ("discountAmount" IS NULL OR "discountAmount" > 0),
  ADD CONSTRAINT "ck_reward_stock" CHECK ("stock" IS NULL OR "stock" >= 0),
  ADD CONSTRAINT "ck_reward_dates" CHECK (
    "validFrom" IS NULL OR "validTo" IS NULL OR "validTo" > "validFrom"
  );

ALTER TABLE "RewardRedemption"
  ADD CONSTRAINT "ck_redemption_points" CHECK ("pointsSpent" > 0),
  ADD CONSTRAINT "ck_redemption_used" CHECK ("status" <> 'USED' OR "usedAt" IS NOT NULL),
  ADD CONSTRAINT "ck_redemption_cancelled" CHECK ("status" <> 'CANCELLED' OR "cancelledAt" IS NOT NULL);

-- Transversales
ALTER TABLE "IdempotencyRecord"
  ADD CONSTRAINT "ck_idempotency_key" CHECK (char_length("key") BETWEEN 8 AND 255),
  ADD CONSTRAINT "ck_idempotency_expiry" CHECK ("expiresAt" > "createdAt");

ALTER TABLE "NotificationLog"
  ADD CONSTRAINT "ck_notification_attempts" CHECK ("attempts" >= 0);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Índices únicos parciales
-- ════════════════════════════════════════════════════════════════════════════

-- Una dirección predeterminada activa por usuario.
CREATE UNIQUE INDEX "uq_address_default_per_user"
  ON "Address" ("userId") WHERE "isDefault" AND "deletedAt" IS NULL;

-- Una imagen principal por producto.
CREATE UNIQUE INDEX "uq_product_image_primary"
  ON "ProductImage" ("productId") WHERE "isPrimary";

-- Un pedido solo se cobra una vez (online o en efectivo).
CREATE UNIQUE INDEX "uq_payment_single_collected_per_order"
  ON "Payment" ("orderId") WHERE "status" IN ('PAID', 'CASH_COLLECTED');

-- Los puntos de un pedido se conceden una sola vez y se revierten una sola vez.
CREATE UNIQUE INDEX "uq_loyalty_earn_per_order"
  ON "LoyaltyTransaction" ("orderId") WHERE "type" = 'EARN';
CREATE UNIQUE INDEX "uq_loyalty_reversal_per_order"
  ON "LoyaltyTransaction" ("orderId") WHERE "type" = 'REVERSAL' AND "orderId" IS NOT NULL;

-- Cada canje de recompensa descuenta puntos una vez y se devuelve una vez.
CREATE UNIQUE INDEX "uq_loyalty_redeem_per_redemption"
  ON "LoyaltyTransaction" ("redemptionId") WHERE "type" = 'REDEEM';
CREATE UNIQUE INDEX "uq_loyalty_reversal_per_redemption"
  ON "LoyaltyTransaction" ("redemptionId") WHERE "type" = 'REVERSAL' AND "redemptionId" IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Tablas de solo-añadir (inmutables)
-- ════════════════════════════════════════════════════════════════════════════

CREATE FUNCTION forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on "%" is not allowed: the table is append-only', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER "trg_loyalty_transaction_append_only"
  BEFORE UPDATE OR DELETE ON "LoyaltyTransaction"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER "trg_audit_log_append_only"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER "trg_order_status_history_append_only"
  BEFORE UPDATE OR DELETE ON "OrderStatusHistory"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER "trg_payment_event_append_only"
  BEFORE UPDATE OR DELETE ON "PaymentEvent"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER "trg_invoice_append_only"
  BEFORE UPDATE OR DELETE ON "Invoice"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Libro de puntos: el saldo solo cambia mediante movimientos
-- ════════════════════════════════════════════════════════════════════════════

-- Al insertar un movimiento: bloquea la cuenta (serializa los accesos concurrentes), calcula el
-- saldo resultante, rechaza saldos negativos y actualiza la cuenta en la misma sentencia.
CREATE FUNCTION apply_loyalty_transaction() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  current_balance integer;
BEGIN
  SELECT "balance" INTO current_balance
    FROM "LoyaltyAccount" WHERE "id" = NEW."accountId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loyalty account % does not exist', NEW."accountId"
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  NEW."balanceAfter" := current_balance + NEW."points";
  IF NEW."balanceAfter" < 0 THEN
    RAISE EXCEPTION 'Insufficient loyalty points: balance %, movement %', current_balance, NEW."points"
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE "LoyaltyAccount"
     SET "balance" = NEW."balanceAfter",
         "lifetimeEarned" = "lifetimeEarned" + CASE WHEN NEW."type" = 'EARN' THEN NEW."points" ELSE 0 END,
         "updatedAt" = now()
   WHERE "id" = NEW."accountId";
  RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_loyalty_transaction_apply"
  BEFORE INSERT ON "LoyaltyTransaction"
  FOR EACH ROW EXECUTE FUNCTION apply_loyalty_transaction();

-- Impide modificar el saldo directamente: solo se permite desde el trigger anterior
-- (profundidad de triggers >= 2). Una cuenta nueva siempre empieza en cero.
CREATE FUNCTION guard_loyalty_account() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."balance" <> 0 OR NEW."lifetimeEarned" <> 0 THEN
      RAISE EXCEPTION 'A loyalty account must start with a zero balance'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  ELSIF (NEW."balance" IS DISTINCT FROM OLD."balance"
      OR NEW."lifetimeEarned" IS DISTINCT FROM OLD."lifetimeEarned")
     AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'The loyalty balance can only change through ledger transactions'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_loyalty_account_guard"
  BEFORE INSERT OR UPDATE ON "LoyaltyAccount"
  FOR EACH ROW EXECUTE FUNCTION guard_loyalty_account();

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Coherencia de pedidos entre tablas
-- ════════════════════════════════════════════════════════════════════════════

-- El subtotal de un pedido debe coincidir con la suma de sus líneas. Se comprueba al confirmar
-- la transacción (DEFERRED), de modo que el pedido y sus líneas se pueden insertar en cualquier orden.
CREATE FUNCTION check_order_subtotal() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_order uuid;
  declared numeric;
  computed numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_order := OLD."orderId";
  ELSIF TG_TABLE_NAME = 'Order' THEN
    target_order := NEW."id";
  ELSE
    target_order := NEW."orderId";
  END IF;

  SELECT "subtotal" INTO declared FROM "Order" WHERE "id" = target_order;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(sum("lineTotal"), 0) INTO computed FROM "OrderItem" WHERE "orderId" = target_order;
  IF declared <> computed THEN
    RAISE EXCEPTION 'Order % subtotal (%) does not match the sum of its lines (%)',
      target_order, declared, computed USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "trg_order_subtotal_matches_items"
  AFTER INSERT OR UPDATE OF "subtotal" ON "Order"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_order_subtotal();
CREATE CONSTRAINT TRIGGER "trg_order_item_subtotal_matches_items"
  AFTER INSERT OR UPDATE OR DELETE ON "OrderItem"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_order_subtotal();

-- Un pedido pendiente de pago no puede avanzar sin un pago confirmado (o efectivo pendiente).
-- Un pago fallido nunca convierte un pedido en pedido pagado.
CREATE FUNCTION check_order_payment_before_progress() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'PENDING_PAYMENT'
     AND NEW."status" NOT IN ('PENDING_PAYMENT', 'CANCELLED', 'REJECTED')
     AND NOT EXISTS (
       SELECT 1 FROM "Payment"
        WHERE "orderId" = NEW."id" AND "status" IN ('PAID', 'CASH_PENDING', 'CASH_COLLECTED')
     ) THEN
    RAISE EXCEPTION 'Order % cannot leave PENDING_PAYMENT without a confirmed payment', NEW."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_order_requires_payment_to_progress"
  BEFORE UPDATE OF "status" ON "Order"
  FOR EACH ROW EXECUTE FUNCTION check_order_payment_before_progress();
