-- 2026-12-09 门店目标支持「业绩目标 / 复购目标」双指标
-- 背景：店长提点的达成条件目前只有整店实收（operatingRevenueTop），
--       业务还需要按「当月复购金额」设门店目标并提点。
-- 口径：metric_type=0 走整店实收（沿用原逻辑）；metric_type=1 走当月复购金额
--       （有效订单中客户在本单服务日之前已有到店记录的订单实付合计）。
--       老数据默认 0，行为不变。
-- 只在 tou_mall_test 生效；生产由 scripts/make-prod-sql.py 生成。

SET @right_db = IF(DATABASE() = 'tou_mall_test', 1, 0);

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='s_shop_incentive_target' AND COLUMN_NAME='metric_type');
SET @ddl := IF(@right_db = 1,
  IF(@col = 0,
    'ALTER TABLE `s_shop_incentive_target` ADD COLUMN `metric_type` tinyint NOT NULL DEFAULT 0 COMMENT ''目标指标：0=业绩目标（整店实收） 1=复购目标（当月复购金额）'' AFTER `month_code`',
    'SELECT ''s_shop_incentive_target.metric_type exists'''),
  'SELECT * FROM fullyu_incentive_target_metric_type_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 自检
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='s_shop_incentive_target' AND COLUMN_NAME='metric_type';

SELECT metric_type, COUNT(*) FROM s_shop_incentive_target GROUP BY metric_type;

-- 回滚（新列对旧 jar 透明，留着无影响；确需删除时执行）
-- ALTER TABLE `s_shop_incentive_target` DROP COLUMN `metric_type`;