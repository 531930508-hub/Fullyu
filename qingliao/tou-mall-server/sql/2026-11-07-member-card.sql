-- Full愈年卡（会员卡）
-- 日期：2026-11-07
-- 说明：仅用于测试/预发环境验证，正式环境执行前需二次确认。

CREATE TABLE IF NOT EXISTS `s_member_card_config` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `card_name` VARCHAR(50) NOT NULL DEFAULT 'Full愈年卡',
  `price` DECIMAL(10,2) NOT NULL DEFAULT 365.00,
  `advance_rate` DECIMAL(5,4) NOT NULL DEFAULT 0.7800 COMMENT '提前预约折扣率',
  `same_day_rate` DECIMAL(5,4) NOT NULL DEFAULT 0.8800 COMMENT '当日预约折扣率',
  `valid_days` INT NOT NULL DEFAULT 365,
  `renewal_remind_days` INT NOT NULL DEFAULT 30,
  `purchase_notice` VARCHAR(500) DEFAULT NULL,
  `refund_notice` VARCHAR(500) DEFAULT NULL,
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '0停售 1在售',
  `create_time` DATETIME DEFAULT NULL,
  `update_time` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='会员年卡配置';

CREATE TABLE IF NOT EXISTS `c_customer_member_card` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `card_no` VARCHAR(32) NOT NULL COMMENT '卡号',
  `customer_id` BIGINT NOT NULL,
  `period_no` INT NOT NULL DEFAULT 1 COMMENT '第几个权益期',
  `start_time` DATETIME NOT NULL,
  `end_time` DATETIME NOT NULL,
  `advance_rate` DECIMAL(5,4) NOT NULL COMMENT '开卡快照',
  `same_day_rate` DECIMAL(5,4) NOT NULL COMMENT '开卡快照',
  `amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '实付开卡金额',
  `pay_order_id` BIGINT DEFAULT NULL COMMENT '开卡支付单',
  `channel` TINYINT NOT NULL DEFAULT 1 COMMENT '1小程序 2后台手工',
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '0待生效 1生效 2已过期 3已退款',
  `refund_amount` DECIMAL(10,2) DEFAULT NULL,
  `refund_time` DATETIME DEFAULT NULL,
  `refund_reason` VARCHAR(255) DEFAULT NULL,
  `operator_id` BIGINT DEFAULT NULL,
  `remark` VARCHAR(255) DEFAULT NULL,
  `create_time` DATETIME DEFAULT NULL,
  `update_time` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_card_no` (`card_no`),
  KEY `idx_customer_period` (`customer_id`, `start_time`, `end_time`),
  KEY `idx_status_end` (`status`, `end_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='客户会员卡权益期';

CREATE TABLE IF NOT EXISTS `c_member_card_order` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_sn` VARCHAR(64) NOT NULL,
  `customer_id` BIGINT NOT NULL,
  `config_id` BIGINT NOT NULL,
  `card_id` BIGINT DEFAULT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `state` TINYINT NOT NULL DEFAULT 0 COMMENT '0待支付 1已支付 2已关闭 3已退款',
  `pay_type` TINYINT DEFAULT NULL,
  `pay_time` DATETIME DEFAULT NULL,
  `refund_amount` DECIMAL(10,2) DEFAULT NULL,
  `refund_time` DATETIME DEFAULT NULL,
  `create_time` DATETIME DEFAULT NULL,
  `update_time` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_sn` (`order_sn`),
  KEY `idx_customer` (`customer_id`),
  KEY `idx_state` (`state`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='会员卡开卡支付单';

INSERT INTO `s_member_card_config`
(`card_name`, `price`, `advance_rate`, `same_day_rate`, `valid_days`, `renewal_remind_days`,
 `purchase_notice`, `refund_notice`, `status`, `create_time`, `update_time`)
SELECT 'Full愈年卡', 365.00, 0.7800, 0.8800, 365, 30,
       '开通后 365 天内，服务项目提前一天及以上预约享 7.8 折，当日预约享 8.8 折。年卡价、通用折扣、积分抵扣、Full愈券四种优惠不叠加。',
       '年卡仅支持后台发起退款，退款成功后权益立即失效，已产生的订单优惠不追回。',
       1, NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `s_member_card_config` WHERE `status` = 1);

-- ============ 订单优惠来源字段 ============
SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `s_order` ADD COLUMN `price_source` TINYINT NULL COMMENT ''1年卡提前价 2年卡当日价 3通用折扣 4积分 5Full愈券''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 's_order' AND column_name = 'price_source');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `s_order` ADD COLUMN `member_card_id` BIGINT NULL COMMENT ''本单使用的年卡权益期''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 's_order' AND column_name = 'member_card_id');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `s_order` ADD COLUMN `member_rate` DECIMAL(5,4) NULL COMMENT ''本单使用的年卡费率快照''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 's_order' AND column_name = 'member_rate');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `s_order` ADD COLUMN `benefit_amount` DECIMAL(10,2) NULL COMMENT ''本单优惠金额''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 's_order' AND column_name = 'benefit_amount');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============ 后台菜单：客户管理 > 会员卡 ============
INSERT INTO `ums_menu` (`parent_id`, `create_time`, `title`, `level`, `sort`, `name`, `icon`, `hidden`)
SELECT 52, NOW(), '会员卡', 1, 1, 'memberCard', 'ums-admin', 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `ums_menu` WHERE `name` = 'memberCard' AND `parent_id` = 52);

INSERT INTO `ums_role_menu_relation` (`role_id`, `menu_id`)
SELECT r.id, m.id
FROM `ums_role` r
JOIN `ums_menu` m ON m.`name` = 'memberCard' AND m.`parent_id` = 52
WHERE r.id IN (5, 8, 9, 11)
  AND NOT EXISTS (
    SELECT 1 FROM `ums_role_menu_relation` x WHERE x.`role_id` = r.id AND x.`menu_id` = m.id
  );
