-- 会籍以 CRM 品牌卡为准：customers 增加卡状态快照与同步时间（5 分钟 TTL）。
-- 生产 MySQL 已有同名列（迁移阶段已建），本迁移只对开发 SQLite 生效。
ALTER TABLE "customers" ADD COLUMN "crm_card_state" TEXT;
ALTER TABLE "customers" ADD COLUMN "member_synced_at" DATETIME;