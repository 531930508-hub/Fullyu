-- CRM · 邀请好友名额按季 + 并发唯一键（只新增列/索引，不删除、不改动既有数据）
-- 适用：MySQL 8（阿里云 RDS）
-- 执行：npx prisma db execute --file prisma/additive-invite-quarter.sql --schema prisma/schema.prisma
-- 背景：
--   1) 名额由「每月 N 次」改为「每季 1 张」；month_key 列沿用旧列名承载季度键（2026-Q4），避免重建列丢历史邀请。
--   2) 新增 slot（周期内第几个名额）+ 唯一键，兜住并发重复生成导致超额发券。
-- 注意：历史行 slot 为空，不参与唯一约束；旧月度键（2026-11）不再计入新季度名额，过渡季度按新规则重新计数。

ALTER TABLE `member_invites` ADD COLUMN `slot` INT NULL;
ALTER TABLE `member_invites` ADD UNIQUE INDEX `member_invites_inviter_id_month_key_slot_key`
  (`inviter_id`, `month_key`, `slot`);