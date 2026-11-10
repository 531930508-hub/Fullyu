-- Full愈礼品卡预收台账。仅隔离测试库执行；生产未授权。
-- 发放/批量发放/导入（导入即发放）记正向面值；作废已发放未领取的卡记负向；领取兑券不记账。
-- 唯一键 (gift_card_id,event_type) + INSERT IGNORE 保证按卡+事件幂等。禁止 mysql --force。
SET @ddl = IF(DATABASE()='tou_mall_test',
  'CREATE TABLE IF NOT EXISTS `s_gift_card_prepaid_log` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `gift_card_id` BIGINT NOT NULL COMMENT ''礼品卡id'',
    `code` VARCHAR(255) DEFAULT NULL COMMENT ''礼品卡code快照'',
    `activity_id` BIGINT DEFAULT NULL,
    `shop_id` BIGINT DEFAULT NULL,
    `event_type` VARCHAR(16) NOT NULL COMMENT ''DISTRIBUTE 发放 / VOID 作废'',
    `amount` DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT ''预收金额，发放正、作废负'',
    `operator` BIGINT DEFAULT NULL COMMENT ''操作人'',
    `create_time` DATETIME NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_gift_card_event` (`gift_card_id`,`event_type`),
    KEY `idx_gift_card_prepaid_time` (`create_time`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT=''礼品卡预收台账''',
  'SELECT * FROM fullyu_gift_card_prepaid_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 历史回填（可重复执行）：已有发放时间的卡补一条发放；其中已作废的再补一条作废冲减。
-- 发放时间取 distribution_time，作废时间取 failure_time；未发放即作废的卡（distribution_time 为空）不记。
SET @ddl = IF(DATABASE()='tou_mall_test',
  'INSERT IGNORE INTO `s_gift_card_prepaid_log`(gift_card_id,code,activity_id,shop_id,event_type,amount,operator,create_time)
   SELECT id,code,activity_id,shop_id,''DISTRIBUTE'',COALESCE(amount,0),distribution_user,distribution_time
   FROM `s_gift_card` WHERE distribution_time IS NOT NULL',
  'SELECT * FROM fullyu_gift_card_prepaid_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(DATABASE()='tou_mall_test',
  'INSERT IGNORE INTO `s_gift_card_prepaid_log`(gift_card_id,code,activity_id,shop_id,event_type,amount,operator,create_time)
   SELECT id,code,activity_id,shop_id,''VOID'',-COALESCE(amount,0),NULL,COALESCE(failure_time,distribution_time)
   FROM `s_gift_card` WHERE status=0 AND distribution_time IS NOT NULL',
  'SELECT * FROM fullyu_gift_card_prepaid_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
