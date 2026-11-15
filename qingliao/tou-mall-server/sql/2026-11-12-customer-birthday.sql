-- Full愈 · 客户档案增加生日字段
-- 适用：MySQL 5.7/8.0，执行前请先备份。
-- 说明：
--   1. 只新增字段，不改写现有业务数据；脚本可重复执行。
--   2. 后台预约抽屉、客户编辑弹窗提交生日后写入 c_customer.birthday。
--   3. 首页「今日服务安排」按 月-日 比对展示生日标识，用于生日关怀。

SET @has_column = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'c_customer' AND COLUMN_NAME = 'birthday'
);

SET @ddl = IF(@has_column = 0,
  'ALTER TABLE `c_customer` ADD COLUMN `birthday` DATE NULL DEFAULT NULL COMMENT ''客户生日'' AFTER `note`',
  'SELECT ''c_customer.birthday already exists'' AS notice');

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;