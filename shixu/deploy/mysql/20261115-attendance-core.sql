-- 考勤域上线：在店时段 / 计划班次 / 劳务结算单 + 门店劳务单价（E0–E3）。
-- 生产 MySQL 手工执行（仓库内 prisma/migrations 是开发 SQLite 方言，不能直接 deploy）。
--
-- 执行时机：首次上线「到店确认 / 排班表 / 考勤月报 / 劳务结算」时执行一次。
-- 只做加法：3 张新表 + stores 1 个新列，不改不删任何既有表/列/数据。
-- 重复执行会报表/列已存在，属预期；执行后必须重新生成 prisma client 再重启，旧进程不认新表。
--
-- 与 SQLite 版本的差异：布尔用 tinyint(1)，时间统一 datetime(3)，浮点用 double，
-- 字符串沿用 varchar(191) 与现有表一致；business_date / period_* 只存 YYYY-MM-DD，用 varchar(32)。
--
-- 归属口径（与代码一致）：在店时段的 business_date 按【到店时刻】的上海日期归属，跨零点不切分。

-- 1) 门店劳务单价（分/分钟）。默认 220 = 2.2 元/分钟，出单时作为快照写进结算单。
ALTER TABLE `stores`
  ADD COLUMN `labor_rate_per_min_cents` int NOT NULL DEFAULT 220;

-- 2) 在店时段：一次「到店确认 → 离店确认」。
--    open_key 在段处于 open 时写入 user_id、闭合即释放；唯一索引保证一人同时只有一段。
CREATE TABLE IF NOT EXISTS `work_sessions` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `store_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `business_date` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `clock_in_at` datetime(3) NOT NULL,
  `clock_out_at` datetime(3) DEFAULT NULL,
  `in_lat` double NOT NULL,
  `in_lng` double NOT NULL,
  `in_accuracy_m` int DEFAULT NULL,
  `in_distance_m` int DEFAULT NULL,
  `out_lat` double DEFAULT NULL,
  `out_lng` double DEFAULT NULL,
  `out_accuracy_m` int DEFAULT NULL,
  `out_distance_m` int DEFAULT NULL,
  -- open | pending_close | closed | lapsed | voided（只有 closed 计入工时）
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `open_key` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pending_approval_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `note` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `adjusted_by` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `adjusted_at` datetime(3) DEFAULT NULL,
  `adjust_reason` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `work_sessions_open_key_key` (`open_key`),
  UNIQUE KEY `work_sessions_pending_approval_id_key` (`pending_approval_id`),
  KEY `work_sessions_store_id_business_date_idx` (`store_id`, `business_date`),
  KEY `work_sessions_user_id_business_date_idx` (`user_id`, `business_date`),
  KEY `work_sessions_status_clock_in_at_idx` (`status`, `clock_in_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) 计划班次：一人一店一日一条，start_min/end_min 为相对当日 00:00 的分钟数。
CREATE TABLE IF NOT EXISTS `planned_shifts` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `store_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `business_date` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_min` int NOT NULL,
  `end_min` int NOT NULL,
  `note` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `created_by` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `planned_shifts_store_id_user_id_business_date_key` (`store_id`, `user_id`, `business_date`),
  KEY `planned_shifts_store_id_business_date_idx` (`store_id`, `business_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) 劳务结算单：金额唯一事实源，Expense 只是投影（posted_expense_id 唯一 + expense.source_key 兜重复入账）。
CREATE TABLE IF NOT EXISTS `work_settlements` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `store_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `period_start` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `period_end` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `minutes` int NOT NULL,
  `rate_per_min_cents` int NOT NULL,
  `base_amount_cents` int NOT NULL DEFAULT 0,
  `adjustment_cents` int NOT NULL DEFAULT 0,
  `adjustment_note` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `amount_cents` int NOT NULL,
  -- draft | posted | voided
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `lines_json` text COLLATE utf8mb4_unicode_ci,
  `unclosed_count` int NOT NULL DEFAULT 0,
  `pending_approvals` int NOT NULL DEFAULT 0,
  `posted_expense_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `confirmed_by` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `confirmed_at` datetime(3) DEFAULT NULL,
  `confirmed_note` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `voided_at` datetime(3) DEFAULT NULL,
  `voided_by` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `void_reason` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `work_settlements_posted_expense_id_key` (`posted_expense_id`),
  UNIQUE KEY `work_settlements_store_id_user_id_period_start_period_end_key` (`store_id`, `user_id`, `period_start`, `period_end`),
  KEY `work_settlements_store_id_period_start_idx` (`store_id`, `period_start`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;