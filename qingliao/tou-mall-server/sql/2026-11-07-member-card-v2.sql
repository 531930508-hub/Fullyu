-- Full愈会员卡 v2：月卡/年卡、后台自定义时长与批量发卡、不可退条款
-- 日期：2026-11-07
-- 说明：仅用于测试/预发环境验证，正式环境执行前需二次确认。

-- ============ 1. 会员卡产品配置 ============
SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `s_member_card_config` ADD COLUMN `card_type` VARCHAR(20) NOT NULL DEFAULT ''year'' COMMENT ''month月卡 year年卡 custom自定义''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 's_member_card_config' AND column_name = 'card_type');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `s_member_card_config` ADD COLUMN `recommend` TINYINT NOT NULL DEFAULT 0 COMMENT ''1推荐''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 's_member_card_config' AND column_name = 'recommend');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `s_member_card_config` ADD COLUMN `sort` INT NOT NULL DEFAULT 0 COMMENT ''展示顺序，越大越靠前''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 's_member_card_config' AND column_name = 'sort');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `s_member_card_config` ADD COLUMN `base_price` DECIMAL(10,2) NOT NULL DEFAULT 396.00 COMMENT ''回本示例原价（60分钟项目）''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 's_member_card_config' AND column_name = 'base_price');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `s_member_card_config` ADD COLUMN `sample_minutes` INT NOT NULL DEFAULT 60 COMMENT ''回本示例时长（分钟）''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 's_member_card_config' AND column_name = 'sample_minutes');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `s_member_card_config` ADD COLUMN `benefit_desc` TEXT NULL COMMENT ''全业务线权益说明''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 's_member_card_config' AND column_name = 'benefit_desc');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `s_member_card_config` ADD COLUMN `terms` TEXT NULL COMMENT ''购买条款与免责声明''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 's_member_card_config' AND column_name = 'terms');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============ 2. 客户权益期快照 ============
SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_customer_member_card` ADD COLUMN `card_type` VARCHAR(20) NOT NULL DEFAULT ''year'' COMMENT ''month月卡 year年卡 custom自定义''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_customer_member_card' AND column_name = 'card_type');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_customer_member_card` ADD COLUMN `card_name` VARCHAR(50) DEFAULT NULL COMMENT ''开卡名称快照''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_customer_member_card' AND column_name = 'card_name');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_customer_member_card` ADD COLUMN `valid_days` INT DEFAULT NULL COMMENT ''有效期天数快照''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_customer_member_card' AND column_name = 'valid_days');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_customer_member_card` ADD COLUMN `batch_no` VARCHAR(32) DEFAULT NULL COMMENT ''批量发卡批次号''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_customer_member_card' AND column_name = 'batch_no');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============ 3. 开卡单购买资料 ============
SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_member_card_order` ADD COLUMN `card_type` VARCHAR(20) DEFAULT NULL COMMENT ''month月卡 year年卡 custom自定义''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_member_card_order' AND column_name = 'card_type');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_member_card_order` ADD COLUMN `contact_name` VARCHAR(50) DEFAULT NULL COMMENT ''称呼''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_member_card_order' AND column_name = 'contact_name');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_member_card_order` ADD COLUMN `contact_gender` TINYINT DEFAULT NULL COMMENT ''1男 2女''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_member_card_order' AND column_name = 'contact_gender');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_member_card_order` ADD COLUMN `contact_wechat` VARCHAR(64) DEFAULT NULL COMMENT ''微信号''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_member_card_order' AND column_name = 'contact_wechat');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_member_card_order` ADD COLUMN `contact_birthday` DATE DEFAULT NULL COMMENT ''生日''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_member_card_order' AND column_name = 'contact_birthday');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_member_card_order` ADD COLUMN `join_group` TINYINT NOT NULL DEFAULT 1 COMMENT ''1希望加入会员社群''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_member_card_order' AND column_name = 'join_group');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============ 4. 存量年卡配置更新为 299 元新口径 ============
UPDATE `s_member_card_config`
SET `card_type` = 'year',
    `card_name` = 'Full愈年卡',
    `price` = 299.00,
    `advance_rate` = 0.7550,
    `same_day_rate` = 0.8500,
    `valid_days` = 365,
    `recommend` = 1,
    `sort` = 2,
    `base_price` = 396.00,
    `sample_minutes` = 60,
    `purchase_notice` = '年卡有效期内，轻疗所有项目享会员价；在场课程享会员优惠价及好友免单权益；时叙每杯茶饮立减。会员价与积分抵扣、优惠券等不叠加，系统自动按最低价结算。',
    `terms` = '1. 会员卡为虚拟权益，购买后不可退款、不可转让；\n2. 权益仅在有效期内有效，到期未续费自动失效；\n3. 会员价与积分抵扣、优惠券、储值卡折扣不叠加，系统自动选择最低价；\n4. 会员卡价格及权益可能调整，已生效权益期按开卡时快照执行；\n5. 如遇不可抗力或系统故障，以门店实际可提供的服务为准。',
    `benefit_desc` = '轻疗：所有项目会员价\n在场：课程会员优惠价、好友免单\n时叙：每杯茶饮立减',
    `update_time` = NOW()
WHERE `status` = 1 AND (`card_type` IS NULL OR `card_type` = 'year');

-- ============ 5. 新增月卡 45 元 / 30 天 ============
INSERT INTO `s_member_card_config`
(`card_name`, `card_type`, `price`, `advance_rate`, `same_day_rate`, `valid_days`, `renewal_remind_days`,
 `base_price`, `sample_minutes`, `recommend`, `sort`, `purchase_notice`, `terms`, `benefit_desc`,
 `refund_notice`, `status`, `create_time`, `update_time`)
SELECT 'Full愈月卡', 'month', 45.00, 0.9400, 0.9700, 30, 7,
       396.00, 60, 0, 1,
       '月卡有效期内，轻疗所有项目享会员价；在场课程享会员优惠价；时叙每杯茶饮立减。会员价与积分抵扣、优惠券等不叠加，系统自动按最低价结算。',
       '1. 会员卡为虚拟权益，购买后不可退款、不可转让；\n2. 权益仅在有效期内有效，到期未续费自动失效；\n3. 会员价与积分抵扣、优惠券、储值卡折扣不叠加，系统自动选择最低价；\n4. 会员卡价格及权益可能调整，已生效权益期按开卡时快照执行。',
       '轻疗：所有项目会员价\n在场：课程会员优惠价\n时叙：每杯茶饮立减',
       NULL, 1, NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `s_member_card_config` WHERE `card_type` = 'month');
