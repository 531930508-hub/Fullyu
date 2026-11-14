-- Full愈 · 值集选项英文文案（只新增列，不删除、不修改既有列）
-- 适用：MySQL 8（阿里云 RDS）
-- 执行：npx prisma db execute --file prisma/additive-dict-label-en.sql --schema prisma/schema.prisma
-- 说明：小程序英文界面按 label_en 展示，未配置时回退 label。

ALTER TABLE `dict_items`
  ADD COLUMN `label_en` VARCHAR(191) NULL AFTER `label`;