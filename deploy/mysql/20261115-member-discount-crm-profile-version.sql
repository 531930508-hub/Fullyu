-- 2026-11-15 发版：顾客资料与 CRM 双向同步 + 年卡会员每杯立减落库
--
-- 背景：仓库内 prisma/migrations 是开发 SQLite 方言，生产 MySQL 一律按本目录的 DDL 手工执行，
-- 并记入 docs/release-2026-11-15-资料同步与会员每杯立减.md。
-- 对应迁移：apps/server/prisma/migrations/20261118100000_customer_crm_profile_version、
--           apps/server/prisma/migrations/20261118110000_member_discount
--
-- 全部是「加列 + 默认值」，不动既有数据；orders / order_items / customers 都是热表，
-- ALTER 为 online DDL（INPLACE，允许并发读写），但仍在低峰执行并先做全库备份。
--
-- 执行：mysql teahour < deploy/mysql/20261115-member-discount-crm-profile-version.sql
-- 重复执行会报 Duplicate column，属预期（无 IF NOT EXISTS 语法，MySQL 8 不支持）。
--
-- 回滚：ALTER TABLE ... DROP COLUMN 三表共 5 列；注意回滚前先确认没有依赖新列的历史单。

-- 1) 顾客：最近一次与 CRM 对齐的资料版本号（CRM profileVersion 更新时据此判断是否回写本地快照）
ALTER TABLE `customers`
  ADD COLUMN `crm_profile_version` int NOT NULL DEFAULT 0;

-- 2) 订单：年卡会员每杯立减（标准 / 杯数 / 总额），金额已计入 discount_cents 并从 total_cents 扣掉
ALTER TABLE `orders`
  ADD COLUMN `member_discount_per_cup_cents` int NOT NULL DEFAULT 0,
  ADD COLUMN `member_discount_cups` int NOT NULL DEFAULT 0,
  ADD COLUMN `member_discount_cents` int NOT NULL DEFAULT 0;

-- 3) 订单行：该行分摊到的会员立减金额（退款按实付比例分摊时天然包含）
ALTER TABLE `order_items`
  ADD COLUMN `member_discount_cents` int NOT NULL DEFAULT 0;