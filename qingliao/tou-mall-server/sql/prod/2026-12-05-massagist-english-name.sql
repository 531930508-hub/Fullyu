-- 【生产版】由 sql/2026-12-05-massagist-english-name.sql 自动生成（scripts/make-prod-sql.py）。
-- 改动仅一处：把「仅测试库执行 / 非测试库就报错」的守卫改为无条件执行。
-- 执行前请备份；执行后跑 ./scripts/sql-audit.py 校验结构。
-- 2026-12-05 疗愈师英文名
-- 背景：排班看板、考核记录、历史《疗愈师培训考核表》里疗愈师都是「中文名 + 英文名」
--       （如 阿舍 Asher）。目前英文名只散落在考核表里，系统没有落库字段，导出只能人工补。
-- 口径：english_name 选填，仅作展示/导出用；不改 ums_admin.nick_name（后台登录仍是中文名），
--       也不参与任何按姓名匹配的逻辑（findNameById、订单、分成都不读它）。
-- 只在 tou_mall_test 生效；生产由 scripts/make-prod-sql.py 生成。

SET @right_db = IF(DATABASE()<>'', 1, 0);

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='s_massagist' AND COLUMN_NAME='english_name');
SET @ddl := IF(@right_db = 1,
  IF(@col = 0,
    'ALTER TABLE `s_massagist` ADD COLUMN `english_name` varchar(64) DEFAULT NULL COMMENT ''英文名，选填，仅展示/导出用'' AFTER `name`',
    'SELECT ''s_massagist.english_name exists'''),
  'SELECT * FROM fullyu_massagist_english_name_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 自检
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='s_massagist' AND COLUMN_NAME='english_name';

-- 回滚（新列对旧 jar 透明，留着无影响；确需删除时执行）
-- ALTER TABLE `s_massagist` DROP COLUMN `english_name`;
