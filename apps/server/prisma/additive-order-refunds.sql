-- Full愈 · 订单退款流水（强制退款状态机）增量迁移（只新增表，不删除、不修改既有列）
-- 适用：MySQL 8（阿里云 RDS）
-- 执行：npx prisma db execute --file prisma/additive-order-refunds.sql --schema prisma/schema.prisma
-- 注意：本文件可单独审计；不要用 prisma db push / migrate，避免触及其他人工维护的表。

-- 1) 退款流水表：每次退款申请一行；同一订单先退一部分再退一部分即两行，
--    累计 SUCCESS 金额不得超过实付；退款中（PROCESSING/UNKNOWN）不允许再次发起。
CREATE TABLE `order_refunds` (
  `id` VARCHAR(191) NOT NULL,
  `order_id` VARCHAR(191) NOT NULL,
  `out_refund_no` VARCHAR(191) NOT NULL,
  `amount_fen` INT NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'PROCESSING',
  `source` VARCHAR(32) NOT NULL DEFAULT 'ADMIN_FORCE',
  `prev_order_status` VARCHAR(32) NULL,
  `reason` TEXT NULL,
  `operator_id` VARCHAR(191) NULL,
  `operator_name` VARCHAR(191) NULL,
  `approval_id` VARCHAR(191) NULL,
  `gateway_ref` VARCHAR(191) NULL,
  `fail_code` VARCHAR(32) NULL,
  `fail_message` TEXT NULL,
  `attempts` INT NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `settled_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `order_refunds_out_refund_no_key` (`out_refund_no`),
  INDEX `order_refunds_order_id_status_idx` (`order_id`, `status`),
  INDEX `order_refunds_status_idx` (`status`),
  CONSTRAINT `order_refunds_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
