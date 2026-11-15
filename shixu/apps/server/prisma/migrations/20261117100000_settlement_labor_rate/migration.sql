-- 工资结算口径升级：门店配置劳务单价（分/分钟），结算单拆出「基础 + 人工调整」。
-- 旧数据：base_amount_cents 先按既有 amount_cents 回填，adjustment 归零，保证历史结算单金额不变。
ALTER TABLE "stores" ADD COLUMN "labor_rate_per_min_cents" INTEGER NOT NULL DEFAULT 220;

ALTER TABLE "work_settlements" ADD COLUMN "base_amount_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "work_settlements" ADD COLUMN "adjustment_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "work_settlements" ADD COLUMN "adjustment_note" TEXT NOT NULL DEFAULT '';

UPDATE "work_settlements" SET "base_amount_cents" = "amount_cents" WHERE "base_amount_cents" = 0;