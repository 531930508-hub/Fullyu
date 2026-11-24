-- CRM · 卡账本下发索引（只加索引，不改数据）
-- 适用：MySQL 8（阿里云 RDS）
-- 执行：npx prisma db execute --file prisma/member-cards-sync-index-20261124.sql --schema prisma/schema.mysql.prisma
-- 背景：GET /v1/brand-member/cards 按 updated_at + id 做 keyset 分页，业务端按小时增量对账；
--   没有该索引时每翻一页都要对全表排序。
-- 注意：MySQL 8 不支持 CREATE INDEX IF NOT EXISTS，重复执行会报 1061（索引已存在），视为已完成。
-- 建议低峰执行；该表体量小（万级），在线加索引通常秒级完成。

ALTER TABLE `member_brand_cards`
  ADD INDEX `member_brand_cards_updated_at_id_idx` (`updated_at`, `id`);