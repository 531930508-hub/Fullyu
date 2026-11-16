-- 月度定向发放：规则执行记录表 coupon_rule_runs
-- 生产 MySQL 手工执行（仓库内 prisma/migrations 是开发 MySQL 方言，与本文一致）。
--
-- 用途：
--   1) 一条月度规则一个自然月只允许一条记录（rule_id + period 唯一），是「本月是否已发」的判据；
--   2) cursor_id 记录分批写入的断点，进程崩溃/发券失败后从断点续跑，不会重复发券；
--   3) claimed_at 是租约，超过 5 分钟未刷新即可被下一轮调度接管，避免卡死在 running。
--
-- 执行前提：coupon_rules / coupons 两表已存在（20261115-coupon-scope-validity-rules.sql 之后）。
-- 本表只新增、不改动既有表，可安全重复执行（IF NOT EXISTS）；执行后部署新 server 并重启。
--
-- 与 SQLite 版本的差异：时间统一 datetime(3)，布尔语义用 status 字符串表达，文本沿用 varchar(191)。

CREATE TABLE IF NOT EXISTS `coupon_rule_runs` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rule_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `coupon_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  -- 上海时区自然月 YYYY-MM，与 customer_coupons.rule_period 同值
  `period` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  -- manual=运营手动提前发放；auto=调度器按期执行
  `trigger` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  -- pending / running / succeeded / failed（failed 保留断点可续跑）
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  -- 目标人数 / 已发出 / 已跳过（本周期已发过）
  `target_count` int NOT NULL DEFAULT 0,
  `issued` int NOT NULL DEFAULT 0,
  `skipped` int NOT NULL DEFAULT 0,
  -- 断点：最后一条已处理的顾客 id，NULL 表示从头开始
  `cursor_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `batch_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attempts` int NOT NULL DEFAULT 0,
  `last_error` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `operator_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `operator_name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `claimed_at` datetime(3) DEFAULT NULL,
  `started_at` datetime(3) DEFAULT NULL,
  `finished_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `coupon_rule_runs_rule_id_period_key` (`rule_id`, `period`),
  KEY `coupon_rule_runs_status_claimed_at_idx` (`status`, `claimed_at`),
  CONSTRAINT `coupon_rule_runs_rule_id_fkey` FOREIGN KEY (`rule_id`) REFERENCES `coupon_rules` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `coupon_rule_runs_coupon_id_fkey` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 校验：表已建好、索引与唯一键就位
-- SHOW CREATE TABLE `coupon_rule_runs`;