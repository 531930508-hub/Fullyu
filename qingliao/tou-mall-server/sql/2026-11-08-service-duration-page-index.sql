-- 服务时长分页覆盖索引；仅隔离测试库，生产未授权。
-- 不改变完成/接待封顶/结算口径，不修改业务行。
-- 禁止 mysql --force；数据库守卫每次执行；重复执行不重复建索引。
SET @ddl = (SELECT IF(DATABASE()='tou_mall_test', IF(COUNT(*)=0,
  'ALTER TABLE `oms_order_detail` ADD INDEX `idx_duration_page` (`state`,`end_time`,`shop_id`,`massagist_id`), ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT 1'), 'SELECT * FROM fullyu_duration_index_requires_tou_mall_test')
  FROM information_schema.statistics WHERE table_schema=DATABASE()
    AND table_name='oms_order_detail' AND index_name='idx_duration_page');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
