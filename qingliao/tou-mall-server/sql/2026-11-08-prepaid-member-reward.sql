-- Full愈：现有预付券包实际用完后赠会员月数。仅隔离测试库执行；生产尚未授权。
-- 每笔购买订单一次，默认0。历史订单不回填赠送，不更改金额/余额/原会员权益。
-- 不使用mysql --force；每个DDL都校验数据库。新调度默认关闭，迁移/回归后单独启用。
SET @ddl = (SELECT IF(DATABASE()='tou_mall_test', IF(COUNT(*) = 0,
  'ALTER TABLE `s_product` ADD COLUMN `reward_member_months` INT NOT NULL DEFAULT 0 COMMENT ''每笔预付券包订单实际用完赠会员月数，0不赠''',
  'SELECT 1'), 'SELECT * FROM fullyu_prepaid_reward_migration_requires_tou_mall_test') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 's_product' AND column_name = 'reward_member_months');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(DATABASE()='tou_mall_test', IF(COUNT(*) = 0,
  'ALTER TABLE `s_order` ADD COLUMN `reward_member_months` INT NOT NULL DEFAULT 0 COMMENT ''购买时用完赠会员月数快照，历史默认0''',
  'SELECT 1'), 'SELECT * FROM fullyu_prepaid_reward_migration_requires_tou_mall_test') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 's_order' AND column_name = 'reward_member_months');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(DATABASE()='tou_mall_test', IF(COUNT(*) = 0,
  'ALTER TABLE `c_customer_member_card` ADD COLUMN `reward_source_order_id` BIGINT DEFAULT NULL COMMENT ''耗尽赠会员源购买订单，一单最多一次''',
  'SELECT 1'), 'SELECT * FROM fullyu_prepaid_reward_migration_requires_tou_mall_test') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_customer_member_card' AND column_name = 'reward_source_order_id');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(DATABASE()='tou_mall_test', IF(COUNT(*) = 0,
  'ALTER TABLE `c_customer_member_card` ADD UNIQUE INDEX `uk_member_reward_source_order` (`reward_source_order_id`)',
  'SELECT 1'), 'SELECT * FROM fullyu_prepaid_reward_migration_requires_tou_mall_test') FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'c_customer_member_card' AND index_name = 'uk_member_reward_source_order');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(DATABASE()='tou_mall_test',
  'CREATE TABLE IF NOT EXISTS `n_prepaid_member_reward_task` (
    source_order_id BIGINT NOT NULL,
    state VARCHAR(16) NOT NULL DEFAULT ''PENDING'',
    attempts INT NOT NULL DEFAULT 0,
    next_attempt_at DATETIME NOT NULL,
    create_time DATETIME NOT NULL,
    update_time DATETIME NOT NULL,
    PRIMARY KEY(source_order_id),
    KEY idx_prepaid_reward_due(state,next_attempt_at,source_order_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
  'SELECT * FROM fullyu_prepaid_reward_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 券包发券幂等标记：支付回调以 coupon_issued 0→1 条件更新领取发券权，多实例/重复回调只发一次。
-- 实体不映射此列，updateById 不会把旧对象的值写回。
SET @ddl = (SELECT IF(DATABASE()='tou_mall_test', IF(COUNT(*) = 0,
  'ALTER TABLE `s_order` ADD COLUMN `coupon_issued` TINYINT NOT NULL DEFAULT 0 COMMENT ''券包购买订单是否已发券，1已发''',
  'SELECT 1'), 'SELECT * FROM fullyu_prepaid_reward_migration_requires_tou_mall_test') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 's_order' AND column_name = 'coupon_issued');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 历史已发券订单回填为1（仅购买券 type=0），可重复执行。
SET @ddl = IF(DATABASE()='tou_mall_test',
  'UPDATE `s_order` o JOIN (SELECT DISTINCT order_id FROM `sms_customer_coupon` WHERE type = 0 AND order_id IS NOT NULL) c
     ON c.order_id = o.id SET o.coupon_issued = 1 WHERE o.coupon_issued = 0',
  'SELECT * FROM fullyu_prepaid_reward_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
