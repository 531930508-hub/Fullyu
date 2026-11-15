-- 2026-11-28 临时调店支持中间时段 + 可恢复原排班
-- 背景：调店原先只按「当天整天」处理（清空原店当天排班），既不能只调 14:00-18:00 这类中间时段，
--       也没有撤销入口。本次给调店记录加一列 origin_schedules 保存调店前的原店排班快照，
--       调店时按窗口切分原店排班，撤销时按快照还原。
-- 依赖：s_massagist_schedules 已存在（target_shop_id / schedules_type 已在用）
-- 可重复执行；脚本只在 tou_mall_test 生效，生产版由 scripts/make-prod-sql.py 生成

SET @right_db = IF(DATABASE()='tou_mall_test', 1, 0);

SET @ddl = (SELECT IF(@right_db = 1 AND COUNT(*) = 0,
    'ALTER TABLE s_massagist_schedules ADD COLUMN origin_schedules TEXT NULL COMMENT ''调店前原店排班快照(JSON)，仅调店记录使用''',
    'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 's_massagist_schedules'
      AND COLUMN_NAME = 'origin_schedules');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 自检：应返回 origin_schedules / text / YES
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 's_massagist_schedules'
  AND COLUMN_NAME = 'origin_schedules';