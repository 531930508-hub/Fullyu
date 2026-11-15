-- 2026-11-29 月度结算单（快照 + 通知）
-- 背景：激励中心的「合作结算预估」一直是实时计算，疗愈师离开/调整规则后历史口径会漂移，
--       财务无法据此发放。这里落快照：生成后金额冻结在 s_monthly_settlement，
--       状态 DRAFT（草稿，可重新生成）→ CONFIRMED（财务确认，禁止重算）→ PUBLISHED（已发布，通知到人）。
-- 通知落在 n_admin_message，按 biz_key + admin_id 幂等，避免重复提醒。
-- 只在 tou_mall_test 生效；生产由 scripts/make-prod-sql.py 生成。

SET @right_db = IF(DATABASE() = 'tou_mall_test', 1, 0);

SET @ddl = IF(@right_db = 1,
'CREATE TABLE IF NOT EXISTS `s_monthly_settlement` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `month_code` varchar(7) NOT NULL COMMENT ''结算月份 yyyy-MM'',
  `shop_id` bigint DEFAULT NULL COMMENT ''门店id（冗余快照）'',
  `shop_name` varchar(64) DEFAULT NULL COMMENT ''门店名（生成时快照）'',
  `massagist_id` bigint NOT NULL COMMENT ''疗愈师id'',
  `massagist_name` varchar(64) DEFAULT NULL COMMENT ''疗愈师姓名'',
  `status` varchar(16) NOT NULL DEFAULT ''DRAFT'' COMMENT ''DRAFT/CONFIRMED/PUBLISHED'',
  `config_revision` int DEFAULT NULL COMMENT ''生成时激励参数版本'',
  `using_default_config` tinyint DEFAULT 0 COMMENT ''是否使用默认参数'',
  `base_amount` decimal(12,2) DEFAULT 0.00 COMMENT ''基础薪资'',
  `manager_amount` decimal(12,2) DEFAULT 0.00 COMMENT ''店长奖励'',
  `training_amount` decimal(12,2) DEFAULT 0.00 COMMENT ''培训奖励'',
  `repurchase_amount` decimal(12,2) DEFAULT 0.00 COMMENT ''复购奖励（已计入）'',
  `repurchase_potential` decimal(12,2) DEFAULT 0.00 COMMENT ''复购潜在奖励（未到账）'',
  `adjustment_amount` decimal(12,2) DEFAULT 0.00 COMMENT ''劳务调整'',
  `subtotal` decimal(12,2) DEFAULT 0.00 COMMENT ''小计'',
  `gross` decimal(12,2) DEFAULT 0.00 COMMENT ''含服务费金额'',
  `pre_tax` decimal(12,2) DEFAULT 0.00 COMMENT ''税前'',
  `tax` decimal(12,2) DEFAULT 0.00 COMMENT ''个税'',
  `net` decimal(12,2) DEFAULT 0.00 COMMENT ''应发'',
  `counted_minutes` decimal(12,2) DEFAULT 0.00 COMMENT ''计入时长（分钟）'',
  `cooperation_status` varchar(16) DEFAULT NULL COMMENT ''合作状态快照'',
  `warnings` text COMMENT ''结算警告（JSON）'',
  `detail_json` mediumtext COMMENT ''生成时的看板快照（收入构成/警告明细）'',
  `remark` varchar(255) DEFAULT NULL COMMENT ''财务备注'',
  `generated_by` varchar(64) DEFAULT NULL,
  `generated_time` datetime DEFAULT NULL,
  `confirmed_by` varchar(64) DEFAULT NULL,
  `confirmed_time` datetime DEFAULT NULL,
  `published_by` varchar(64) DEFAULT NULL,
  `published_time` datetime DEFAULT NULL,
  `create_time` datetime DEFAULT NULL,
  `update_time` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_settlement_month_massagist` (`month_code`, `massagist_id`),
  KEY `idx_settlement_shop_month` (`shop_id`, `month_code`),
  KEY `idx_settlement_month_status` (`month_code`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT=''月度结算单快照''',
'DO 0');
PREPARE settlement_stmt FROM @ddl;
EXECUTE settlement_stmt;
DEALLOCATE PREPARE settlement_stmt;

SET @ddl = IF(@right_db = 1,
'CREATE TABLE IF NOT EXISTS `n_admin_message` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `type` varchar(32) NOT NULL COMMENT ''SETTLEMENT_DRAFT/SETTLEMENT_CONFIRMED/SETTLEMENT_PUBLISHED'',
  `title` varchar(128) DEFAULT NULL,
  `content` varchar(1024) DEFAULT NULL,
  `link` varchar(255) DEFAULT NULL COMMENT ''前端跳转路径'',
  `shop_id` bigint DEFAULT NULL COMMENT ''关联门店，店长只收本店'',
  `month_code` varchar(7) DEFAULT NULL COMMENT ''关联月份'',
  `admin_id` bigint NOT NULL COMMENT ''接收人'',
  `biz_key` varchar(160) NOT NULL COMMENT ''幂等键'',
  `read_time` datetime DEFAULT NULL,
  `create_time` datetime DEFAULT NULL,
  `update_time` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_admin_message_biz` (`biz_key`, `admin_id`),
  KEY `idx_admin_message_inbox` (`admin_id`, `read_time`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT=''后台站内消息''',
'DO 0');
PREPARE settlement_stmt FROM @ddl;
EXECUTE settlement_stmt;
DEALLOCATE PREPARE settlement_stmt;

-- 自检
SELECT COUNT(*) AS settlement_table_exists FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name = 's_monthly_settlement';
SELECT COUNT(*) AS message_table_exists FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name = 'n_admin_message';