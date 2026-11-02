-- CreateTable
CREATE TABLE "counters" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "value" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value_json" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "city" TEXT NOT NULL,
    "city_en" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "short" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "address_en" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "open" BOOLEAN NOT NULL DEFAULT true,
    "retail_pickup" BOOLEAN NOT NULL DEFAULT true,
    "hours" TEXT NOT NULL,
    "printer_status" TEXT NOT NULL DEFAULT 'online',
    "channels_json" TEXT NOT NULL,
    "positions_json" TEXT NOT NULL,
    "wait_minutes" INTEGER NOT NULL DEFAULT 8
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "kind" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "cost_cents" INTEGER NOT NULL,
    "dose_g" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "temps_json" TEXT NOT NULL,
    "ice" BOOLEAN NOT NULL DEFAULT true,
    "member_eligible" BOOLEAN NOT NULL DEFAULT true,
    "desc_zh" TEXT NOT NULL DEFAULT '',
    "desc_en" TEXT NOT NULL DEFAULT '',
    "spec_zh" TEXT NOT NULL DEFAULT '',
    "spec_en" TEXT NOT NULL DEFAULT '',
    "tag_zh" TEXT NOT NULL DEFAULT '',
    "tag_en" TEXT NOT NULL DEFAULT '',
    "unit_zh" TEXT NOT NULL DEFAULT '',
    "unit_en" TEXT NOT NULL DEFAULT '',
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "stock" (
    "store_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "grams" REAL NOT NULL DEFAULT 0,
    "sold_out" BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY ("store_id", "product_id"),
    CONSTRAINT "stock_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "mappings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "external_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '袋',
    "factor" REAL NOT NULL DEFAULT 1,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "mappings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "perms_json" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "all_stores" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,

    PRIMARY KEY ("user_id", "role_id"),
    CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user_stores" (
    "user_id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,

    PRIMARY KEY ("user_id", "store_id"),
    CONSTRAINT "user_stores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_stores_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "member_code" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '茶客',
    "phone" TEXT,
    "open_id" TEXT,
    "union_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "orders" (
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

-- CreateTable
CREATE TABLE "order_items" (
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
    "unit_price_cents" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "cost_cents" INTEGER NOT NULL,
    "temp" TEXT,
    "ice" TEXT,
    CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "order_units" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "order_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "scanned_at" DATETIME,
    CONSTRAINT "order_units_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "order_units_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "order_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "finance_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "order_id" TEXT,
    "store_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "settlement" TEXT NOT NULL,
    "memo" TEXT NOT NULL DEFAULT '',
    "cost_cents" INTEGER NOT NULL DEFAULT 0,
    "dedupe_key" TEXT NOT NULL,
    "at" DATETIME NOT NULL,
    CONSTRAINT "finance_entries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "store_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "at" TEXT NOT NULL,
    "memo" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL,
    "batch_id" TEXT,
    "created_by" TEXT,
    "created_at" DATETIME NOT NULL,
    "voided_at" DATETIME,
    "voided_by" TEXT
);

-- CreateTable
CREATE TABLE "losses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "store_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "qty" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "reported_by" TEXT,
    "decided_by" TEXT,
    "decided_at" DATETIME,
    "decision_note" TEXT NOT NULL DEFAULT '',
    "approval_id" TEXT,
    "at" DATETIME NOT NULL,
    CONSTRAINT "losses_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "losses_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actor_id" TEXT,
    "actor_name" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT '',
    "store_id" TEXT,
    "order_id" TEXT,
    "at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "print_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "order_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload_json" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "print_jobs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "response_json" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "mappings_external_id_key" ON "mappings"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "customers_member_code_key" ON "customers"("member_code");

-- CreateIndex
CREATE UNIQUE INDEX "customers_open_id_key" ON "customers"("open_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_number_key" ON "orders"("number");

-- CreateIndex
CREATE INDEX "orders_store_id_status_created_at_idx" ON "orders"("store_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "orders_customer_id_created_at_idx" ON "orders"("customer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "order_units_label_key" ON "order_units"("label");

-- CreateIndex
CREATE UNIQUE INDEX "finance_entries_dedupe_key_key" ON "finance_entries"("dedupe_key");

-- CreateIndex
CREATE INDEX "finance_entries_store_id_at_idx" ON "finance_entries"("store_id", "at");

-- CreateIndex
CREATE INDEX "expenses_store_id_at_idx" ON "expenses"("store_id", "at");

-- CreateIndex
CREATE INDEX "losses_store_id_at_idx" ON "losses"("store_id", "at");

-- CreateIndex
CREATE INDEX "approvals_status_created_at_idx" ON "approvals"("status", "created_at");

-- CreateIndex
CREATE INDEX "logs_at_idx" ON "logs"("at");

-- CreateIndex
CREATE INDEX "print_jobs_status_created_at_idx" ON "print_jobs"("status", "created_at");

