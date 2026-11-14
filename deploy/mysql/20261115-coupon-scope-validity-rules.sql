-- 优惠券：批次发放、作废、范围（单品）、发放后 N 天有效期、会员快照、自动化规则。
-- 生产 MySQL 手工执行（仓库内 prisma/migrations 是开发 SQLite 方言）。
--
-- 执行前提：coupons / customer_coupons 两表仍是 11-13 版结构且**没有存量数据**
-- （发布时实查均为 0 行；若已有券数据，须改为先 ALTER 加列再回填，不能直接重建）。
-- 重复执行会报表/列已存在，属预期；执行后立即部署新 server 并重启，旧进程不认新列。
--
-- 与 SQLite 版本的差异：布尔用 tinyint(1)，时间统一 datetime(3)，
-- 文本字段沿用 varchar(191) / text 与现有表一致，JSON 配置存在 text 里由代码解析。

-- 1) 券模板：单品范围、发放后 N 天、自助领取与每人张数
ALTER TABLE `coupons`
  ADD COLUMN `product_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ADD COLUMN `valid_days` int NOT NULL DEFAULT 0,
  ADD COLUMN `claimable` tinyint(1) NOT NULL DEFAULT 0,
  ADD COLUMN `claim_limit` int NOT NULL DEFAULT 1,
  ADD KEY `coupons_claimable_valid_to_idx` (`claimable`, `valid_to`);

-- 2) 发券批次：一次发放动作的可追溯记录
CREATE TABLE IF NOT EXISTS `coupon_batches` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `coupon_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `requested` int NOT NULL DEFAULT 0,
  `issued` int NOT NULL DEFAULT 0,
  `skipped` int NOT NULL DEFAULT 0,
  `filter` text COLLATE utf8mb4_unicode_ci,
  `request_key` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `note` varchar(2000) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `operator_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `operator_name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `coupon_batches_request_key_key` (`request_key`),
  KEY `coupon_batches_coupon_id_created_at_idx` (`coupon_id`, `created_at`),
  CONSTRAINT `coupon_batches_coupon_id_fkey` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) 自动化规则：生日 / 新客欢迎 / 沉睡唤醒；config 为 JSON 文本
CREATE TABLE IF NOT EXISTS `coupon_rules` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `coupon_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kind` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `tier` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'all',
  `config` text COLLATE utf8mb4_unicode_ci,
  `note` varchar(2000) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `last_run_at` datetime(3) DEFAULT NULL,
  `last_run_issued` int NOT NULL DEFAULT 0,
  `last_run_skipped` int NOT NULL DEFAULT 0,
  `created_by` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `coupon_rules_enabled_idx` (`enabled`),
  CONSTRAINT `coupon_rules_coupon_id_fkey` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) 持券实例：有效期下沉到实例 + 会员快照 + 批次/规则归因；先删后建（表内无数据）
DROP TABLE IF EXISTS `customer_coupons`;
CREATE TABLE `customer_coupons` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `coupon_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `batch_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'available',
  `issued_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  -- 本张券的实际可用区间：发放/领取时刻 + N 天，或券模板区间（取较早）
  `valid_from` datetime(3) NOT NULL,
  `valid_to` datetime(3) NOT NULL,
  `used_at` datetime(3) DEFAULT NULL,
  `order_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `revoked_at` datetime(3) DEFAULT NULL,
  `revoke_reason` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `revoked_by` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- 发券时会员快照，之后不随会员变化回写
  `member_tier` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `member_since` datetime(3) DEFAULT NULL,
  `order_count` int NOT NULL DEFAULT 0,
  -- 规则来源：同规则同周期对同一会员只发一次
  `rule_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rule_period` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_coupons_rule_id_customer_id_rule_period_key` (`rule_id`, `customer_id`, `rule_period`),
  KEY `customer_coupons_customer_id_status_idx` (`customer_id`, `status`),
  KEY `customer_coupons_coupon_id_customer_id_idx` (`coupon_id`, `customer_id`),
  KEY `customer_coupons_coupon_id_valid_to_idx` (`coupon_id`, `valid_to`),
  KEY `customer_coupons_batch_id_status_idx` (`batch_id`, `status`),
  CONSTRAINT `customer_coupons_coupon_id_fkey` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_coupons_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `customer_coupons_batch_id_fkey` FOREIGN KEY (`batch_id`) REFERENCES `coupon_batches` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `customer_coupons_rule_id_fkey` FOREIGN KEY (`rule_id`) REFERENCES `coupon_rules` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;