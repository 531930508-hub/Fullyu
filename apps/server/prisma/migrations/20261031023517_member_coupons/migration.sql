-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'all',
    "category_id" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "min_spend_cents" INTEGER NOT NULL DEFAULT 0,
    "valid_from" DATETIME NOT NULL,
    "valid_to" DATETIME NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "customer_coupons" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "coupon_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "issued_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" DATETIME,
    "order_id" TEXT,
    CONSTRAINT "customer_coupons_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "customer_coupons_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_customers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "member_code" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '茶客',
    "phone" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
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
INSERT INTO "new_customers" ("avatar_key", "birthday", "created_at", "gender", "id", "member_code", "member_tier", "member_until", "name", "open_id", "phone", "session_version", "union_id") SELECT "avatar_key", "birthday", "created_at", "gender", "id", "member_code", "member_tier", "member_until", "name", "open_id", "phone", "session_version", "union_id" FROM "customers";
DROP TABLE "customers";
ALTER TABLE "new_customers" RENAME TO "customers";
CREATE UNIQUE INDEX "customers_member_code_key" ON "customers"("member_code");
CREATE UNIQUE INDEX "customers_phone_key" ON "customers"("phone");
CREATE UNIQUE INDEX "customers_open_id_key" ON "customers"("open_id");
CREATE TABLE "new_orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "business" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "seat" TEXT,
    "status" TEXT NOT NULL,
    "payment_status" TEXT NOT NULL DEFAULT 'unpaid',
    "total_cents" INTEGER NOT NULL,
    "refunded_cents" INTEGER NOT NULL DEFAULT 0,
    "coupon_id" TEXT,
    "coupon_title" TEXT,
    "coupon_discount_cents" INTEGER NOT NULL DEFAULT 0,
    "pickup_code" TEXT,
    "pickup_store_id" TEXT,
    "print_status" TEXT NOT NULL DEFAULT 'pending',
    "parent_order_id" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "customer_id" TEXT,
    "owner_kind" TEXT NOT NULL DEFAULT 'customer',
    "created_by" TEXT,
    "payment_ref" TEXT,
    "payment_method" TEXT,
    "prepared_at" DATETIME,
    "created_at" DATETIME NOT NULL,
    "paid_at" DATETIME,
    "delivered_at" DATETIME,
    "refund_pending" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_orders" ("business", "channel", "created_at", "created_by", "customer_id", "delivered_at", "id", "note", "number", "owner_kind", "paid_at", "parent_order_id", "payment_method", "payment_ref", "payment_status", "pickup_code", "pickup_store_id", "prepared_at", "print_status", "refund_pending", "refunded_cents", "seat", "status", "store_id", "total_cents", "type") SELECT "business", "channel", "created_at", "created_by", "customer_id", "delivered_at", "id", "note", "number", "owner_kind", "paid_at", "parent_order_id", "payment_method", "payment_ref", "payment_status", "pickup_code", "pickup_store_id", "prepared_at", "print_status", "refund_pending", "refunded_cents", "seat", "status", "store_id", "total_cents", "type" FROM "orders";
DROP TABLE "orders";
ALTER TABLE "new_orders" RENAME TO "orders";
CREATE UNIQUE INDEX "orders_number_key" ON "orders"("number");
CREATE INDEX "orders_store_id_status_created_at_idx" ON "orders"("store_id", "status", "created_at");
CREATE INDEX "orders_customer_id_created_at_idx" ON "orders"("customer_id", "created_at");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "customer_coupons_customer_id_status_idx" ON "customer_coupons"("customer_id", "status");

-- CreateIndex
CREATE INDEX "customer_coupons_coupon_id_customer_id_idx" ON "customer_coupons"("coupon_id", "customer_id");
