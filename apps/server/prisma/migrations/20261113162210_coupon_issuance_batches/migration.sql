-- CreateTable
CREATE TABLE "coupon_batches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "coupon_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "requested" INTEGER NOT NULL DEFAULT 0,
    "issued" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "filter" TEXT NOT NULL DEFAULT '',
    "request_key" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "operator_id" TEXT,
    "operator_name" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "coupon_batches_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_customer_coupons" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "coupon_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'available',
    "issued_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" DATETIME,
    "order_id" TEXT,
    "revoked_at" DATETIME,
    "revoke_reason" TEXT NOT NULL DEFAULT '',
    "revoked_by" TEXT,
    CONSTRAINT "customer_coupons_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "customer_coupons_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "customer_coupons_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "coupon_batches" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_customer_coupons" ("coupon_id", "customer_id", "id", "issued_at", "order_id", "status", "used_at") SELECT "coupon_id", "customer_id", "id", "issued_at", "order_id", "status", "used_at" FROM "customer_coupons";
DROP TABLE "customer_coupons";
ALTER TABLE "new_customer_coupons" RENAME TO "customer_coupons";
CREATE INDEX "customer_coupons_customer_id_status_idx" ON "customer_coupons"("customer_id", "status");
CREATE INDEX "customer_coupons_coupon_id_customer_id_idx" ON "customer_coupons"("coupon_id", "customer_id");
CREATE INDEX "customer_coupons_batch_id_status_idx" ON "customer_coupons"("batch_id", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "coupon_batches_request_key_key" ON "coupon_batches"("request_key");

-- CreateIndex
CREATE INDEX "coupon_batches_coupon_id_created_at_idx" ON "coupon_batches"("coupon_id", "created_at");
