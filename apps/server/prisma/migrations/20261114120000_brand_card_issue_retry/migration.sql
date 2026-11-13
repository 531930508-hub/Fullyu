-- 会员卡开卡失败自动重试：记下已试次数与下次重试时间。
-- 钱到账但 CRM 未确认开卡（issue_status=unknown）的单据不再靠人工对账：
-- 后台巡检 + 顾客轮询都会按 issue_next_at 到点重试，开卡带稳定 orderRef，CRM 侧幂等。
ALTER TABLE "brand_card_orders" ADD COLUMN "issue_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "brand_card_orders" ADD COLUMN "issue_next_at" DATETIME;

CREATE INDEX "brand_card_orders_issue_status_issue_next_at_idx" ON "brand_card_orders" ("issue_status", "issue_next_at");