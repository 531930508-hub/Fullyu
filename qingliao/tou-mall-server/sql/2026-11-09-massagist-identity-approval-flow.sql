-- Full愈 疗愈师身份（多选）+ 审批流节点（岗位/指定人、或签/会签）。仅测试库执行。
-- 不使用 mysql --force；每段先校验 DATABASE()，重复执行不会报“列/表已存在”。
-- 旧表 f_approval_shop_manager 只做数据搬迁与留档，代码不再读取；确认稳定后可另行清理。

-- 1. 疗愈师身份：一个疗愈师可同时是店长、内训师，后续可扩展新身份。
SET @ddl := IF(DATABASE()='tou_mall_test',
  'CREATE TABLE IF NOT EXISTS `f_massagist_identity` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `massagist_id` BIGINT NOT NULL COMMENT ''疗愈师id'',
    `code` VARCHAR(32) NOT NULL COMMENT ''身份编码：SHOP_MANAGER 店长 / TRAINER 内训师'',
    `create_user` BIGINT NULL COMMENT ''操作人后台账号id'',
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_massagist_code` (`massagist_id`, `code`),
    KEY `idx_code` (`code`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT=''疗愈师身份（可多选）''',
  'SELECT * FROM fullyu_identity_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 审批流节点：一个审批类型按顺序包含多个节点；节点内可混合“岗位（本店/全部门店）”和“指定人”。
SET @ddl := IF(DATABASE()='tou_mall_test',
  'CREATE TABLE IF NOT EXISTS `f_approval_flow_node` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `category_id` BIGINT NOT NULL COMMENT ''审批类型id'',
    `node_name` VARCHAR(64) NOT NULL COMMENT ''节点名称'',
    `approve_mode` VARCHAR(8) NOT NULL DEFAULT ''ANY'' COMMENT ''ANY 或签 / ALL 会签'',
    `targets_json` TEXT NOT NULL COMMENT ''审批对象JSON：USER 指定人 / IDENTITY 岗位'',
    `sort_order` INT NOT NULL DEFAULT 0 COMMENT ''节点顺序，从0开始'',
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_category_sort` (`category_id`, `sort_order`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT=''审批流程节点''',
  'SELECT * FROM fullyu_identity_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. 审批明细记录节点快照，提交后即使流程再改也不影响在途审批。
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='f_approval_detail' AND COLUMN_NAME='node_name');
SET @ddl := IF(DATABASE()='tou_mall_test',
  IF(@col=0,
    'ALTER TABLE `f_approval_detail` ADD COLUMN `node_name` VARCHAR(64) NULL COMMENT ''节点名称快照'' AFTER `level`',
    'SELECT ''f_approval_detail.node_name exists'''),
  'SELECT * FROM fullyu_identity_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='f_approval_detail' AND COLUMN_NAME='approve_mode');
SET @ddl := IF(DATABASE()='tou_mall_test',
  IF(@col=0,
    'ALTER TABLE `f_approval_detail` ADD COLUMN `approve_mode` VARCHAR(8) NULL COMMENT ''ANY 或签 / ALL 会签快照'' AFTER `node_name`',
    'SELECT ''f_approval_detail.approve_mode exists'''),
  'SELECT * FROM fullyu_identity_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. 历史数据搬迁：旧店长规则 → 店长身份；is_trainer=1 → 内训师身份。
SET @has_old_rule := (SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='f_approval_shop_manager');
SET @ddl := IF(DATABASE()='tou_mall_test' AND @has_old_rule>0,
  'INSERT IGNORE INTO `f_massagist_identity` (`massagist_id`, `code`)
     SELECT `massagist_id`, ''SHOP_MANAGER'' FROM `f_approval_shop_manager` WHERE `massagist_id` IS NOT NULL',
  'SELECT ''f_approval_shop_manager not present, skip''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl := IF(DATABASE()='tou_mall_test',
  'INSERT IGNORE INTO `f_massagist_identity` (`massagist_id`, `code`)
     SELECT `id`, ''TRAINER'' FROM `s_massagist` WHERE `is_trainer`=1',
  'SELECT * FROM fullyu_identity_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
