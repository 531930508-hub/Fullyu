-- 2026-11-30 到店次数改为静态自然日编号
-- 背景：原先「第 N 次到店」是在展示/下单时用统计口径实时算出来的（countMapByCustomerIds + 1、
--       countByCustomerIdNew + 1），口径一改或日期一过，历史订单的「第 N 次」就跟着变，折扣档位也会漂。
-- 本次给 s_order 加 visit_no，建单时按「自然日」写死：同一客户同一自然日只算一次到店，
--       同一天的第二单沿用当天已有序号。历史订单不回填，展示时仍走原口径。
-- 可重复执行；脚本只在 tou_mall_test 生效，生产版由 scripts/make-prod-sql.py 生成

SET @right_db = IF(DATABASE()='tou_mall_test', 1, 0);

SET @ddl = (SELECT IF(@right_db = 1 AND COUNT(*) = 0,
    'ALTER TABLE s_order ADD COLUMN visit_no INT NULL COMMENT ''到店次数(自然日编号，建单时静态写入)''',
    'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 's_order'
      AND COLUMN_NAME = 'visit_no');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 自检：应返回 visit_no / int / YES
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 's_order'
  AND COLUMN_NAME = 'visit_no';