-- 2026-12-04 培训考核「已计发」标记
-- 背景：培训补贴按「考核通过次日起累计订单，第30单所在月计一次」实时重算，
--       s_massagist_training_cert 只记住考核通过日，不记得这笔钱有没有发过。
--       历史考勤表里已有 59 个「已计发」格子，若只补 passed_at，达到 30 单的项目
--       会在导入后再次计发（约 18 项 × 500 元重复支出）。
-- 口径：paid_month 非空 = 该项目补贴已在系统外结清；计算器显示「已计发」，
--       earnedAmount 恒为 0，不再进入任何月份的应发合计。
-- 只在 tou_mall_test 生效；生产由 scripts/make-prod-sql.py 生成。

SET @right_db = IF(DATABASE() = 'tou_mall_test', 1, 0);

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='s_massagist_training_cert' AND COLUMN_NAME='paid_month');
SET @ddl := IF(@right_db = 1,
  IF(@col = 0,
    'ALTER TABLE `s_massagist_training_cert` ADD COLUMN `paid_month` varchar(7) DEFAULT NULL COMMENT ''已计发月份 yyyy-MM；非空即已结清，永不再计'' AFTER `team_size`',
    'SELECT ''s_massagist_training_cert.paid_month exists'''),
  'SELECT * FROM fullyu_training_cert_paid_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='s_massagist_training_cert' AND COLUMN_NAME='paid_amount');
SET @ddl := IF(@right_db = 1,
  IF(@col = 0,
    'ALTER TABLE `s_massagist_training_cert` ADD COLUMN `paid_amount` decimal(12,2) DEFAULT NULL COMMENT ''已计发金额；空则按当时配置金额展示'' AFTER `paid_month`',
    'SELECT ''s_massagist_training_cert.paid_amount exists'''),
  'SELECT * FROM fullyu_training_cert_paid_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='s_massagist_training_cert' AND INDEX_NAME='idx_cert_paid_month');
SET @ddl := IF(@right_db = 1,
  IF(@idx = 0,
    'ALTER TABLE `s_massagist_training_cert` ADD KEY `idx_cert_paid_month` (`paid_month`)',
    'SELECT ''idx_cert_paid_month exists'''),
  'SELECT * FROM fullyu_training_cert_paid_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
