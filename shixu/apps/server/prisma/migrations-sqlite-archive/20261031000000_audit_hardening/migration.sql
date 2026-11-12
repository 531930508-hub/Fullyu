-- 审计整改（2026-10-30 台账）：会话版本 / 会员等级权威化 / 退款原子占用 / 支付退款意图 / 打印稳定键 / 费用源行唯一
-- 会话版本一次性 +1：升级后既有员工与顾客令牌全部失效，需重新登录（安全整改策略）
-- AlterTable
ALTER TABLE "expenses" ADD COLUMN "source_key" TEXT;

-- CreateTable
CREATE TABLE "payment_intents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "order_id" TEXT,
    "store_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "method" TEXT,
    "provider_ref" TEXT,
    "fail_reason" TEXT,
    "response_json" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "refund_intents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "order_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "lines_json" TEXT NOT NULL,
    "approval_id" TEXT,
    "requested_by" TEXT,
    "decided_by" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "provider_ref" TEXT,
    "fail_reason" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_approvals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "execution_status" TEXT NOT NULL DEFAULT '',
    "refund_intent_id" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "store_id" TEXT,
    "order_id" TEXT,
    "summary" TEXT NOT NULL,
    "payload_json" TEXT NOT NULL,
    "requested_by" TEXT,
    "decided_by" TEXT,
    "comment" TEXT NOT NULL DEFAULT '',
    "result_note" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL,
    "decided_at" DATETIME
);
INSERT INTO "new_approvals" ("amount_cents", "comment", "created_at", "decided_at", "decided_by", "id", "kind", "order_id", "payload_json", "requested_by", "result_note", "status", "store_id", "summary") SELECT "amount_cents", "comment", "created_at", "decided_at", "decided_by", "id", "kind", "order_id", "payload_json", "requested_by", "result_note", "status", "store_id", "summary" FROM "approvals";
DROP TABLE "approvals";
ALTER TABLE "new_approvals" RENAME TO "approvals";
CREATE INDEX "approvals_status_created_at_idx" ON "approvals"("status", "created_at");
CREATE TABLE "new_customers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "member_code" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '茶客',
    "phone" TEXT,
    "avatar_key" TEXT,
    "gender" INTEGER,
    "birthday" DATETIME,
    "open_id" TEXT,
    "union_id" TEXT,
    "session_version" INTEGER NOT NULL DEFAULT 1,
    "member_tier" TEXT NOT NULL DEFAULT 'standard',
    "member_until" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_customers" ("avatar_key", "birthday", "created_at", "gender", "id", "member_code", "name", "open_id", "phone", "union_id") SELECT "avatar_key", "birthday", "created_at", "gender", "id", "member_code", "name", "open_id", "phone", "union_id" FROM "customers";
DROP TABLE "customers";
ALTER TABLE "new_customers" RENAME TO "customers";
UPDATE "customers" SET "session_version" = 2;
CREATE UNIQUE INDEX "customers_member_code_key" ON "customers"("member_code");
CREATE UNIQUE INDEX "customers_open_id_key" ON "customers"("open_id");
CREATE TABLE "new_order_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "refunded_qty" INTEGER NOT NULL DEFAULT 0,
    "pending_refund_qty" INTEGER NOT NULL DEFAULT 0,
    "unit_price_cents" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "cost_cents" INTEGER NOT NULL,
    "temp" TEXT,
    "ice" TEXT,
    CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_order_items" ("cost_cents", "ice", "id", "kind", "name", "name_en", "order_id", "product_id", "qty", "refunded_qty", "series", "sort_order", "temp", "total_cents", "unit_price_cents") SELECT "cost_cents", "ice", "id", "kind", "name", "name_en", "order_id", "product_id", "qty", "refunded_qty", "series", "sort_order", "temp", "total_cents", "unit_price_cents" FROM "order_items";
DROP TABLE "order_items";
ALTER TABLE "new_order_items" RENAME TO "order_items";
CREATE TABLE "new_print_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "order_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "business_key" TEXT NOT NULL,
    "payload_json" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "claimed_at" DATETIME,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "print_jobs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_print_jobs" ("attempts", "created_at", "id", "kind", "last_error", "order_id", "payload_json", "status", "updated_at") SELECT "attempts", "created_at", "id", "kind", "last_error", "order_id", "payload_json", "status", "updated_at" FROM "print_jobs";
DROP TABLE "print_jobs";
ALTER TABLE "new_print_jobs" RENAME TO "print_jobs";
CREATE UNIQUE INDEX "print_jobs_business_key_key" ON "print_jobs"("business_key");
CREATE INDEX "print_jobs_status_created_at_idx" ON "print_jobs"("status", "created_at");
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "all_stores" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "token_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_users" ("active", "all_stores", "created_at", "id", "name", "password_hash", "username") SELECT "active", "all_stores", "created_at", "id", "name", "password_hash", "username" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
UPDATE "users" SET "token_version" = 2;
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_key_key" ON "payment_intents"("key");

-- CreateIndex
CREATE INDEX "payment_intents_order_id_idx" ON "payment_intents"("order_id");

-- CreateIndex
CREATE INDEX "payment_intents_status_idx" ON "payment_intents"("status");

-- CreateIndex
CREATE INDEX "refund_intents_order_id_idx" ON "refund_intents"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_source_key_key" ON "expenses"("source_key");

