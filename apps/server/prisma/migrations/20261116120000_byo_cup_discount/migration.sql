-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "byo_cup_qty" INTEGER NOT NULL DEFAULT 0,
    "byo_cup_discount_cents" INTEGER NOT NULL DEFAULT 0,
    "temp" TEXT,
    "ice" TEXT,
    CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_order_items" ("cost_cents", "ice", "id", "kind", "name", "name_en", "order_id", "pending_refund_qty", "product_id", "qty", "refunded_qty", "series", "sort_order", "temp", "total_cents", "unit_price_cents") SELECT "cost_cents", "ice", "id", "kind", "name", "name_en", "order_id", "pending_refund_qty", "product_id", "qty", "refunded_qty", "series", "sort_order", "temp", "total_cents", "unit_price_cents" FROM "order_items";
DROP TABLE "order_items";
ALTER TABLE "new_order_items" RENAME TO "order_items";
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
    "byo_cup_cups" INTEGER NOT NULL DEFAULT 0,
    "byo_cup_discount_cents" INTEGER NOT NULL DEFAULT 0,
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
INSERT INTO "new_orders" ("business", "channel", "coupon_discount_cents", "coupon_id", "coupon_title", "created_at", "created_by", "customer_id", "delivered_at", "id", "note", "number", "owner_kind", "paid_at", "parent_order_id", "payment_method", "payment_ref", "payment_status", "pickup_code", "pickup_store_id", "prepared_at", "print_status", "refund_pending", "refunded_cents", "seat", "status", "store_id", "total_cents", "type") SELECT "business", "channel", "coupon_discount_cents", "coupon_id", "coupon_title", "created_at", "created_by", "customer_id", "delivered_at", "id", "note", "number", "owner_kind", "paid_at", "parent_order_id", "payment_method", "payment_ref", "payment_status", "pickup_code", "pickup_store_id", "prepared_at", "print_status", "refund_pending", "refunded_cents", "seat", "status", "store_id", "total_cents", "type" FROM "orders";
DROP TABLE "orders";
ALTER TABLE "new_orders" RENAME TO "orders";
CREATE UNIQUE INDEX "orders_number_key" ON "orders"("number");
CREATE INDEX "orders_store_id_status_created_at_idx" ON "orders"("store_id", "status", "created_at");
CREATE INDEX "orders_customer_id_created_at_idx" ON "orders"("customer_id", "created_at");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
