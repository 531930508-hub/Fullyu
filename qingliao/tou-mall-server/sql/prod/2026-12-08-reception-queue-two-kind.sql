-- 【生产版】由 sql/2026-12-08-reception-queue-two-kind.sql 自动生成（scripts/make-prod-sql.py）。
-- 改动仅一处：把「仅测试库执行 / 非测试库就报错」的守卫改为无条件执行。
-- 执行前请备份；执行后跑 ./scripts/sql-audit.py 校验结构。
-- 2026-12-08 轮牌拆成两套队列：服务单轮牌 / 接待单轮牌
-- 背景：接待单（前台每 15 分钟给到店客人开的单）原来和服务单挤在同一个 s_reception_queue 里，
--       接待把人推到队尾，正在排服务单的客人就被插队了。改成同一天同一店两套队列各走各的：
--       queue_kind = 0 服务单轮牌，1 接待单轮牌。
-- 口径：谁的队列被推进，以明细上钟流水里记的 queue_kind 为准；没有流水的老数据按服务单算。
-- 依赖：s_reception_queue / s_reception_queue_log 已存在（2026-11-19-reception-queue.sql）
-- 可重复执行；脚本只在 tou_mall_test 生效，生产版由 scripts/make-prod-sql.py 生成

SET @right_db = IF(DATABASE()<>'', 1, 0);

-- 1. 队列加轮牌类型：老数据默认 0（服务单），接待队按需惰性生成
SET @ddl = (SELECT IF(@right_db = 1 AND COUNT(*) = 0,
    'ALTER TABLE s_reception_queue ADD COLUMN queue_kind tinyint NOT NULL DEFAULT 0 COMMENT ''轮牌类型 0服务单轮牌 1接待单轮牌''',
    'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 's_reception_queue'
      AND COLUMN_NAME = 'queue_kind');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 队列加值班时间：值班区按「谁先点的值班」排（先点的在上），没点时间的按 seq 兜底
SET @ddl = (SELECT IF(@right_db = 1 AND COUNT(*) = 0,
    'ALTER TABLE s_reception_queue ADD COLUMN duty_time datetime DEFAULT NULL COMMENT ''最近一次点值班的时间，值班区展示顺序用''',
    'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 's_reception_queue'
      AND COLUMN_NAME = 'duty_time');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. 唯一键改成「日期+门店+轮牌类型+人」：同一个人当天在两套队列里各有一行
SET @ddl = (SELECT IF(@right_db = 1 AND COUNT(*) > 0,
    'ALTER TABLE s_reception_queue DROP INDEX uk_date_shop_massagist',
    'SELECT 1')
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 's_reception_queue'
      AND INDEX_NAME = 'uk_date_shop_massagist');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(@right_db = 1 AND COUNT(*) = 0,
    'ALTER TABLE s_reception_queue ADD UNIQUE KEY uk_date_shop_kind_massagist (queue_date, shop_id, queue_kind, massagist_id)',
    'SELECT 1')
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 's_reception_queue'
      AND INDEX_NAME = 'uk_date_shop_kind_massagist');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. 流水加轮牌类型：撤销回位、超时扫描都要能认出「这单推的是哪一队」
SET @ddl = (SELECT IF(@right_db = 1 AND COUNT(*) = 0,
    'ALTER TABLE s_reception_queue_log ADD COLUMN queue_kind tinyint NOT NULL DEFAULT 0 COMMENT ''轮牌类型 0服务单轮牌 1接待单轮牌''',
    'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 's_reception_queue_log'
      AND COLUMN_NAME = 'queue_kind');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 自检：队列两列 + 新唯一键、流水一列；应各返回 1 行
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 's_reception_queue'
  AND COLUMN_NAME IN ('queue_kind', 'duty_time');

SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 's_reception_queue'
  AND INDEX_NAME LIKE 'uk_%'
GROUP BY INDEX_NAME;

SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 's_reception_queue_log'
  AND COLUMN_NAME = 'queue_kind';