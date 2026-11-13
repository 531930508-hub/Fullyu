-- 会员卡自助购卡：生产 MySQL 建表（仓库内 prisma/migrations 是开发 SQLite 方言，
-- 生产 MySQL 历来按本目录的 DDL 手工执行并记入发版记录）。
--
-- 执行时机：首次上线「会员卡购买」时执行一次；重复执行会报表已存在，属预期。
-- 对应 Prisma 模型：apps/server/prisma/schema.prisma › BrandCardOrder
-- 与 SQLite 版本的差异：fail_reason / issue_error 用 TEXT（代码里会截到 500 字），
-- 其余字符串沿用 varchar(191) 与现有表一致。
CREATE TABLE IF NOT EXISTS `brand_card_orders` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_code` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `amount_cents` int NOT NULL,
  `store_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'brand',
  `quote_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quote_expires_at` datetime(3) DEFAULT NULL,
  `pay_status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `issue_status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'idle',
  -- 开卡失败自动重试：已试次数 + 下次重试时间（钱已到、卡未确认的单由后台按此重开）
  `issue_attempts` int NOT NULL DEFAULT 0,
  `issue_next_at` datetime(3) DEFAULT NULL,
  `pay_method` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'wechat',
  `provider_ref` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fail_reason` text COLLATE utf8mb4_unicode_ci,
  `paid_at` datetime(3) DEFAULT NULL,
  `crm_card_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `card_state` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `card_valid_from` datetime(3) DEFAULT NULL,
  `card_valid_until` datetime(3) DEFAULT NULL,
  `issue_error` text COLLATE utf8mb4_unicode_ci,
  `prepay_json` text COLLATE utf8mb4_unicode_ci,
  `prepay_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL,
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `brand_card_orders_customer_id_created_at_idx` (`customer_id`, `created_at`),
  KEY `brand_card_orders_pay_status_idx` (`pay_status`),
  KEY `brand_card_orders_issue_status_issue_next_at_idx` (`issue_status`, `issue_next_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;