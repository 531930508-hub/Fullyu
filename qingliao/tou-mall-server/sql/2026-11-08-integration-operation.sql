-- Full愈：积分管理（单人调整 + 导入）操作记录表与「客户管理 > 积分管理」菜单。
-- 仅隔离测试库执行；生产尚未授权。不使用 mysql --force；DDL 均校验数据库名。
-- 不改动既有 s_integration 积分台账结构，历史导入不回填操作记录。
SET @ddl = IF(DATABASE()='tou_mall_test',
  'CREATE TABLE IF NOT EXISTS `s_integration_operation` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `batch_no` VARCHAR(40) NOT NULL COMMENT ''批次号，单人调整 A 开头，导入 I 开头'',
    `op_type` TINYINT NOT NULL COMMENT ''1 单人调整 2 导入'',
    `customer_id` BIGINT DEFAULT NULL,
    `phone` VARCHAR(20) DEFAULT NULL,
    `score` BIGINT DEFAULT NULL COMMENT ''变动积分，正数增加负数扣减'',
    `reason` VARCHAR(255) DEFAULT NULL,
    `success` TINYINT NOT NULL DEFAULT 0,
    `message` VARCHAR(255) DEFAULT NULL COMMENT ''失败原因'',
    `integration_id` BIGINT DEFAULT NULL COMMENT ''关联 s_integration 记录'',
    `operator_id` BIGINT DEFAULT NULL,
    `operator_name` VARCHAR(64) DEFAULT NULL,
    `create_time` DATETIME NOT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_integration_op_time` (`create_time`),
    KEY `idx_integration_op_customer` (`customer_id`),
    KEY `idx_integration_op_batch` (`batch_no`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT=''积分调整/导入操作记录''',
  'SELECT * FROM fullyu_integration_operation_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(DATABASE()='tou_mall_test',
  'INSERT INTO `ums_menu` (`parent_id`, `create_time`, `title`, `level`, `sort`, `name`, `icon`, `hidden`)
   SELECT 52, NOW(), ''积分管理'', 1, 2, ''integration'', ''ums-admin'', 0 FROM DUAL
   WHERE NOT EXISTS (SELECT 1 FROM `ums_menu` WHERE `name` = ''integration'' AND `parent_id` = 52)',
  'SELECT * FROM fullyu_integration_operation_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(DATABASE()='tou_mall_test',
  'INSERT INTO `ums_role_menu_relation` (`role_id`, `menu_id`)
   SELECT r.id, m.id FROM `ums_role` r
   JOIN `ums_menu` m ON m.`name` = ''integration'' AND m.`parent_id` = 52
   WHERE r.id IN (5, 8, 9, 11)
     AND NOT EXISTS (SELECT 1 FROM `ums_role_menu_relation` x WHERE x.`role_id` = r.id AND x.`menu_id` = m.id)',
  'SELECT * FROM fullyu_integration_operation_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
