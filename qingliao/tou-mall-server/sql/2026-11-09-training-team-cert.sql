-- Full愈 疗愈师内训三人考核。仅测试库执行；生产未授权。
-- 不使用 mysql --force。每段先校验 DATABASE()，重复执行不会报“列已存在”。

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='s_massagist' AND COLUMN_NAME='is_trainer');
SET @ddl := IF(DATABASE()='tou_mall_test',
  IF(@col=0,
    'ALTER TABLE `s_massagist` ADD COLUMN `is_trainer` TINYINT NOT NULL DEFAULT 0 COMMENT ''是否内训师：1是 0否''',
    'SELECT ''s_massagist.is_trainer exists'''),
  'SELECT * FROM fullyu_training_team_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='s_massagist' AND COLUMN_NAME='trainer_since');
SET @ddl := IF(DATABASE()='tou_mall_test',
  IF(@col=0,
    'ALTER TABLE `s_massagist` ADD COLUMN `trainer_since` DATE NULL COMMENT ''成为内训师的日期''',
    'SELECT ''s_massagist.trainer_since exists'''),
  'SELECT * FROM fullyu_training_team_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='s_massagist_training_cert' AND COLUMN_NAME='source');
SET @ddl := IF(DATABASE()='tou_mall_test',
  IF(@col=0,
    'ALTER TABLE `s_massagist_training_cert` ADD COLUMN `source` VARCHAR(16) NOT NULL DEFAULT ''LEGACY'' COMMENT ''LEGACY/TEAM/MANUAL''',
    'SELECT ''s_massagist_training_cert.source exists'''),
  'SELECT * FROM fullyu_training_team_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='s_massagist_training_cert' AND COLUMN_NAME='certified_at');
SET @ddl := IF(DATABASE()='tou_mall_test',
  IF(@col=0,
    'ALTER TABLE `s_massagist_training_cert` ADD COLUMN `certified_at` DATETIME NULL COMMENT ''认证写入时间''',
    'SELECT ''s_massagist_training_cert.certified_at exists'''),
  'SELECT * FROM fullyu_training_team_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='s_massagist_training_cert' AND COLUMN_NAME='team_size');
SET @ddl := IF(DATABASE()='tou_mall_test',
  IF(@col=0,
    'ALTER TABLE `s_massagist_training_cert` ADD COLUMN `team_size` TINYINT NOT NULL DEFAULT 0 COMMENT ''认证团队人数；历史/人工为0''',
    'SELECT ''s_massagist_training_cert.team_size exists'''),
  'SELECT * FROM fullyu_training_team_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl := IF(DATABASE()='tou_mall_test',
  'CREATE TABLE IF NOT EXISTS `s_massagist_training_assessment` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `massagist_id` BIGINT NOT NULL COMMENT ''被考核疗愈师'',
    `shop_id` BIGINT NULL COMMENT ''被考核疗愈师所属门店（提交时快照）'',
    `project_key` VARCHAR(64) NOT NULL,
    `project_name` VARCHAR(128) NOT NULL,
    `assess_date` DATE NOT NULL COMMENT ''考核日期'',
    `result` TINYINT NOT NULL COMMENT ''1通过 0不通过'',
    `trainer_massagist_id` BIGINT NOT NULL,
    `trainer_name` VARCHAR(64) NOT NULL,
    `trainer_shop_id` BIGINT NULL,
    `trainer_admin_id` BIGINT NULL,
    `remark` VARCHAR(500) NULL,
    `submitted_at` DATETIME NOT NULL,
    `voided` TINYINT NOT NULL DEFAULT 0,
    `voided_by` BIGINT NULL,
    `voided_at` DATETIME NULL,
    `void_reason` VARCHAR(500) NULL,
    `create_time` DATETIME NULL,
    PRIMARY KEY (`id`),
    KEY `idx_assess_target` (`massagist_id`,`project_key`,`assess_date`),
    KEY `idx_assess_trainer` (`trainer_massagist_id`,`assess_date`),
    KEY `idx_assess_shop` (`shop_id`,`assess_date`),
    KEY `idx_assess_result` (`result`,`assess_date`),
    KEY `idx_assess_submitted` (`submitted_at`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT=''内训师考核流水''',
  'SELECT * FROM fullyu_training_team_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 历史认证补齐展示字段；不改变 passed_at，不影响奖励。
SET @ddl := IF(DATABASE()='tou_mall_test',
  'UPDATE `s_massagist_training_cert` SET `certified_at`=`passed_at` WHERE `certified_at` IS NULL',
  'SELECT * FROM fullyu_training_team_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
