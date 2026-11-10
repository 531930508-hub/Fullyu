-- Full愈赠券申请单券价值。仅隔离测试库；生产未授权。
-- 历史申请默认为0；不回填券金额、不创建收款或积分记录。
-- 禁止mysql --force；DDL数据库守卫每次执行，不依赖调用方指定正确库。
SET @ddl = (SELECT IF(DATABASE()='tou_mall_test', IF(COUNT(*)=0,
  'ALTER TABLE `s_gift_customer_coupon` ADD COLUMN `coupon_amount` DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT ''单券价值（元），不代表新增现金收款''',
  'SELECT 1'), 'SELECT * FROM fullyu_gift_value_migration_requires_tou_mall_test')
  FROM information_schema.columns WHERE table_schema=DATABASE()
    AND table_name='s_gift_customer_coupon' AND column_name='coupon_amount');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
