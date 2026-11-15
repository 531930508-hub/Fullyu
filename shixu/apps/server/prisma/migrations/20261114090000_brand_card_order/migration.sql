-- 会员卡订单：小程序自助购卡（Full愈年卡/月卡）的本地账本。
-- 一张卡对应一条订单：收款状态与开卡状态分开记录，回调按 id（MB-…）找回本单。
CREATE TABLE "brand_card_orders" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "customer_id" TEXT NOT NULL,
  "product_code" TEXT NOT NULL,
  "product_name" TEXT NOT NULL DEFAULT '',
  "amount_cents" INTEGER NOT NULL,
  "store_id" TEXT NOT NULL DEFAULT 'brand',
  "quote_id" TEXT NOT NULL,
  "quote_expires_at" DATETIME,
  "pay_status" TEXT NOT NULL DEFAULT 'pending',
  "issue_status" TEXT NOT NULL DEFAULT 'idle',
  "pay_method" TEXT NOT NULL DEFAULT 'wechat',
  "provider_ref" TEXT,
  "fail_reason" TEXT,
  "paid_at" DATETIME,
  "crm_card_id" TEXT,
  "card_state" TEXT,
  "card_valid_from" DATETIME,
  "card_valid_until" DATETIME,
  "issue_error" TEXT,
  "prepay_json" TEXT,
  "prepay_at" DATETIME,
  "created_at" DATETIME NOT NULL,
  "updated_at" DATETIME NOT NULL
);

CREATE INDEX "brand_card_orders_customer_id_created_at_idx" ON "brand_card_orders" ("customer_id", "created_at");
CREATE INDEX "brand_card_orders_pay_status_idx" ON "brand_card_orders" ("pay_status");