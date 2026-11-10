-- 低星服务反馈审批：仅供隔离测试库 tou_mall_test；生产未授权。
-- 只增加关联字段/查询索引，不改原评分、不回填历史审批、不自动指定处理人。
-- 每条DDL独立校验数据库；必须使用不带 --force 的 mysql 执行，非测试库在第一条报错并停止。
-- （MySQL 预处理语句不支持 SIGNAL，故沿用查询不存在表的写法使执行中断。）

SET @ddl = (SELECT IF(DATABASE()='tou_mall_test', IF(COUNT(*) = 0,
    'ALTER TABLE `s_massagist_rate` ADD COLUMN `approval_id` BIGINT NULL COMMENT ''低星反馈处理审批ID''',
    'SELECT 1'), 'SELECT * FROM fullyu_low_rating_migration_requires_tou_mall_test') FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 's_massagist_rate' AND column_name = 'approval_id');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(DATABASE()='tou_mall_test', IF(COUNT(*) = 0,
    'ALTER TABLE `s_massagist_rate` ADD COLUMN `review_state` INT NULL COMMENT ''反馈处理状态，不影响原评价''',
    'SELECT 1'), 'SELECT * FROM fullyu_low_rating_migration_requires_tou_mall_test') FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 's_massagist_rate' AND column_name = 'review_state');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(DATABASE()='tou_mall_test', IF(COUNT(*) = 0,
    'ALTER TABLE `s_massagist_rate` ADD INDEX `idx_rating_approval` (`approval_id`)',
    'SELECT 1'), 'SELECT * FROM fullyu_low_rating_migration_requires_tou_mall_test') FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 's_massagist_rate' AND index_name = 'idx_rating_approval');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(DATABASE()='tou_mall_test', IF(COUNT(*) = 0,
    'ALTER TABLE `s_massagist_rate` ADD INDEX `idx_rating_pending` (`review_state`, `approval_id`, `id`)',
    'SELECT 1'), 'SELECT * FROM fullyu_low_rating_migration_requires_tou_mall_test') FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 's_massagist_rate' AND index_name = 'idx_rating_pending');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
