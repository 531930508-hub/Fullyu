-- 月度定向发放：一条规则一个自然月一条执行记录，既是幂等判据也是分批写入的断点。
CREATE TABLE `coupon_rule_runs` (
    `id` VARCHAR(191) NOT NULL,
    `rule_id` VARCHAR(191) NOT NULL,
    `coupon_id` VARCHAR(191) NOT NULL,
    `period` VARCHAR(191) NOT NULL,
    `trigger` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `target_count` INTEGER NOT NULL DEFAULT 0,
    `issued` INTEGER NOT NULL DEFAULT 0,
    `skipped` INTEGER NOT NULL DEFAULT 0,
    `cursor_id` VARCHAR(191) NULL,
    `batch_id` VARCHAR(191) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `last_error` VARCHAR(500) NOT NULL DEFAULT '',
    `operator_id` VARCHAR(191) NULL,
    `operator_name` VARCHAR(191) NOT NULL DEFAULT '',
    `claimed_at` DATETIME(3) NULL,
    `started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `coupon_rule_runs_rule_id_period_key`(`rule_id`, `period`),
    INDEX `coupon_rule_runs_status_claimed_at_idx`(`status`, `claimed_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `coupon_rule_runs`
    ADD CONSTRAINT `coupon_rule_runs_rule_id_fkey` FOREIGN KEY (`rule_id`) REFERENCES `coupon_rules`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `coupon_rule_runs`
    ADD CONSTRAINT `coupon_rule_runs_coupon_id_fkey` FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;