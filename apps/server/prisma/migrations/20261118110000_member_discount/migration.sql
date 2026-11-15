-- 年卡会员每杯立减：订单级汇总用于运营展示与 CRM savedCents 上报，行级金额用于退款对账。
ALTER TABLE "orders" ADD COLUMN "member_discount_per_cup_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN "member_discount_cups" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN "member_discount_cents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "order_items" ADD COLUMN "member_discount_cents" INTEGER NOT NULL DEFAULT 0;