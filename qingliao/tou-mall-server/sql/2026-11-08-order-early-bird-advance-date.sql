-- 早鸟价锁原预约日期：s_order.advance_date
-- 日期：2026-11-08
-- 说明：年卡提前价（price_source=1）落单时记下当时预约的服务日期，之后改约只能 ≥ 这一天。
--       存量早鸟价单不回填：advance_date 为空时后端退回用当前明细日期兜底，不会放行改早。

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `s_order` ADD COLUMN `advance_date` DATE NULL COMMENT ''早鸟价原预约日期，仅 price_source=1 时有值''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 's_order' AND column_name = 'advance_date');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;