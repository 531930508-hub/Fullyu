-- 会籍缓存：CRM 品牌卡为唯一事实源，本地仅存最近一次同步快照。
ALTER TABLE `customers`
    ADD COLUMN `discount_per_cup_cents` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `crm_card_state` VARCHAR(191) NULL,
    ADD COLUMN `member_synced_at` DATETIME(3) NULL;
