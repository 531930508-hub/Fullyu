-- Full愈 · 代金券兑换码增量迁移（只新增列/索引 + 放开 user_id 可空，不删除、不改动既有数据）
-- 适用：MySQL 8（阿里云 RDS）
-- 执行：npx prisma db execute --file prisma/additive-voucher-redeem.sql --schema prisma/schema.prisma
-- 注意：本文件可单独审计；不要用 prisma db push / migrate，避免触及其他人工维护的表。
-- 背景：批量发券先落「未归属」券（user_id 为空 + 唯一兑换码），用户在小程序输入密码后原子抢占归属。

-- 1) 未兑换的批次券不归属任何用户（外键约束保留，既有数据不受影响）
ALTER TABLE `vouchers` MODIFY COLUMN `user_id` VARCHAR(191) NULL;

-- 2) 兑换码 / 批次 / 兑换时间
ALTER TABLE `vouchers` ADD COLUMN `redeem_code` VARCHAR(16) NULL;
ALTER TABLE `vouchers` ADD COLUMN `batch_no` VARCHAR(32) NULL;
ALTER TABLE `vouchers` ADD COLUMN `redeemed_at` DATETIME(3) NULL;

-- 3) 兑换码全局唯一（NULL 不参与唯一约束，存量券不受影响）；批次号普通索引
ALTER TABLE `vouchers` ADD UNIQUE INDEX `vouchers_redeem_code_key` (`redeem_code`);
ALTER TABLE `vouchers` ADD INDEX `vouchers_batch_no_idx` (`batch_no`);