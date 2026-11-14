-- 券模板：新增单品范围、发放后 N 天有效期、自助领取配置
ALTER TABLE "coupons" ADD COLUMN "product_id" TEXT;
ALTER TABLE "coupons" ADD COLUMN "valid_days" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "coupons" ADD COLUMN "claimable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "coupons" ADD COLUMN "claim_limit" INTEGER NOT NULL DEFAULT 1;

-- 自动化发券规则
CREATE TABLE "coupon_rules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "coupon_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "tier" TEXT NOT NULL DEFAULT 'all',
    "config" TEXT NOT NULL DEFAULT '{}',
    "note" TEXT NOT NULL DEFAULT '',
    "last_run_at" DATETIME,
    "last_run_issued" INTEGER NOT NULL DEFAULT 0,
    "last_run_skipped" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "coupon_rules_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "coupon_rules_enabled_idx" ON "coupon_rules"("enabled");
CREATE INDEX "coupons_claimable_valid_to_idx" ON "coupons"("claimable", "valid_to");

-- 券实例：有效期下沉到实例，并补会员快照与规则归因
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_customer_coupons" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "coupon_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'available',
    "issued_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_from" DATETIME NOT NULL,
    "valid_to" DATETIME NOT NULL,
    "used_at" DATETIME,
    "order_id" TEXT,
    "revoked_at" DATETIME,
    "revoke_reason" TEXT NOT NULL DEFAULT '',
    "revoked_by" TEXT,
    "member_tier" TEXT NOT NULL DEFAULT '',
    "member_since" DATETIME,
    "order_count" INTEGER NOT NULL DEFAULT 0,
    "rule_id" TEXT,
    "rule_period" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "customer_coupons_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "customer_coupons_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "customer_coupons_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "coupon_batches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "customer_coupons_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "coupon_rules" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
-- 历史券按模板区间回填可用期；历史会员快照按当前值补一次（此后不再回写）。
INSERT INTO "new_customer_coupons" (
    "id", "coupon_id", "customer_id", "batch_id", "status", "issued_at", "valid_from", "valid_to",
    "used_at", "order_id", "revoked_at", "revoke_reason", "revoked_by",
    "member_tier", "member_since", "order_count"
)
SELECT
    cc."id", cc."coupon_id", cc."customer_id", cc."batch_id", cc."status", cc."issued_at",
    c."valid_from",
    CASE WHEN c."valid_to" < cc."issued_at" THEN cc."issued_at" ELSE c."valid_to" END,
    cc."used_at", cc."order_id", cc."revoked_at", cc."revoke_reason", cc."revoked_by",
    COALESCE(cu."member_tier", ''), cu."created_at",
    (SELECT COUNT(*) FROM "orders" o WHERE o."customer_id" = cc."customer_id" AND o."paid_at" IS NOT NULL)
FROM "customer_coupons" cc
JOIN "coupons" c ON c."id" = cc."coupon_id"
JOIN "customers" cu ON cu."id" = cc."customer_id";
DROP TABLE "customer_coupons";
ALTER TABLE "new_customer_coupons" RENAME TO "customer_coupons";
CREATE INDEX "customer_coupons_customer_id_status_idx" ON "customer_coupons"("customer_id", "status");
CREATE INDEX "customer_coupons_coupon_id_customer_id_idx" ON "customer_coupons"("coupon_id", "customer_id");
CREATE INDEX "customer_coupons_coupon_id_valid_to_idx" ON "customer_coupons"("coupon_id", "valid_to");
CREATE INDEX "customer_coupons_batch_id_status_idx" ON "customer_coupons"("batch_id", "status");
CREATE UNIQUE INDEX "customer_coupons_rule_id_customer_id_rule_period_key" ON "customer_coupons"("rule_id", "customer_id", "rule_period");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;