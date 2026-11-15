-- 【生产版】由 sql/2026-11-13-shop-i18n.sql 自动生成（scripts/make-prod-sql.py）。
-- 改动仅一处：把「仅测试库执行 / 非测试库就报错」的守卫改为无条件执行。
-- 执行前请备份；执行后跑 ./scripts/sql-audit.py 校验结构。
-- Full愈 · 门店中英文双写（小程序英文模式）
-- 适用：MySQL 5.7/8.0，执行前请先备份。
-- 说明：
--   1. 只新增字段，不改写现有数据；三个字段都允许为空。
--   2. 小程序英文模式下取 name_en / address_en / short_address_en，为空则回退中文，
--      所以历史门店不填英文也能正常显示，不会出现空白或英文界面夹中文报错。
--   3. 后台门店表单（门店管理 → 编辑门店）对应「英文门店名 / 英文地址 / 英文简要地址」三项。
--   4. 门店地址的经纬度仍由中文地址取，英文地址只用于展示。

SET @has_name_en := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='s_shop' AND COLUMN_NAME='name_en');
SET @ddl := IF(@has_name_en=0,
  'ALTER TABLE `s_shop`
     ADD COLUMN `name_en` VARCHAR(100) NULL COMMENT ''英文门店名称，空则回退中文''',
  'SELECT ''s_shop.name_en exists''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_address_en := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='s_shop' AND COLUMN_NAME='address_en');
SET @ddl := IF(@has_address_en=0,
  'ALTER TABLE `s_shop`
     ADD COLUMN `address_en` VARCHAR(255) NULL COMMENT ''英文门店地址，空则回退中文''',
  'SELECT ''s_shop.address_en exists''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_short_address_en := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='s_shop' AND COLUMN_NAME='short_address_en');
SET @ddl := IF(@has_short_address_en=0,
  'ALTER TABLE `s_shop`
     ADD COLUMN `short_address_en` VARCHAR(255) NULL COMMENT ''英文简要地址（如楼层/柜台），空则回退中文''',
  'SELECT ''s_shop.short_address_en exists''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;