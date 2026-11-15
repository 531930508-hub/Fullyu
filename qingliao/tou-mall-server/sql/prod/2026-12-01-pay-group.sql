-- 【生产版】由 sql/2026-12-01-pay-group.sql 自动生成（scripts/make-prod-sql.py）。
-- 改动仅一处：把「仅测试库执行 / 非测试库就报错」的守卫改为无条件执行。
-- 执行前请备份；执行后跑 ./scripts/sql-audit.py 校验结构。
-- Full愈 预约单 + 会员卡续费「合并支付」
-- 日期：2026-12-01
-- 背景：会员在门店单次消费 3.5 折、年卡 8 折，跨两个主体（门店 / 品牌会员运营主体）结算，
--       一次微信支付把两笔钱一起收掉，回调后按分单金额各归各的单，并落分账台账。
-- 说明：仅测试库执行；幂等写法，可重复执行。

CREATE TABLE IF NOT EXISTS `s_pay_group` (
  `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
  `pay_no` VARCHAR(32) NOT NULL COMMENT '合并支付流水号（G 开头），作为汇付 mer_ord_id 前缀',
  `customer_id` BIGINT NOT NULL COMMENT '客户 id',
  `order_id` BIGINT NOT NULL COMMENT '预约单 id',
  `order_code` VARCHAR(40) NOT NULL COMMENT '预约单编号',
  `card_order_sn` VARCHAR(40) DEFAULT NULL COMMENT '会员卡续费单号（c_member_card_order.order_sn）',
  `order_amount` DECIMAL(10,2) NOT NULL DEFAULT '0.00' COMMENT '预约单金额（元）',
  `card_amount` DECIMAL(10,2) NOT NULL DEFAULT '0.00' COMMENT '会员卡金额（元）',
  `total_amount` DECIMAL(10,2) NOT NULL DEFAULT '0.00' COMMENT '合并支付总额（元）= 预约单 + 会员卡',
  `state` TINYINT NOT NULL DEFAULT '0' COMMENT '0待支付 1已支付 2已关闭 3重复支付待退款',
  `mer_ord_id` VARCHAR(64) DEFAULT NULL COMMENT '汇付请求流水号（发起支付时回填）',
  `hf_seq_id` VARCHAR(64) DEFAULT NULL COMMENT '汇付全局流水号',
  `party_order_id` VARCHAR(64) DEFAULT NULL COMMENT '微信支付单号',
  `out_trans_id` VARCHAR(64) DEFAULT NULL COMMENT '外部交易号',
  `pay_channel` VARCHAR(20) DEFAULT NULL COMMENT '支付渠道',
  `paid_time` DATETIME DEFAULT NULL COMMENT '支付时间',
  `split_state` TINYINT NOT NULL DEFAULT '0' COMMENT '分账状态 0待分账 1分账成功 2分账失败 3无需分账',
  `split_amount` DECIMAL(10,2) NOT NULL DEFAULT '0.00' COMMENT '应分给门店的金额（元）',
  `split_pay_no` VARCHAR(64) DEFAULT NULL COMMENT '分账请求流水号',
  `split_time` DATETIME DEFAULT NULL COMMENT '分账时间',
  `split_error` VARCHAR(255) DEFAULT NULL COMMENT '分账失败原因',
  `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pay_group_pay_no` (`pay_no`),
  KEY `idx_pay_group_order` (`order_id`),
  KEY `idx_pay_group_customer` (`customer_id`),
  KEY `idx_pay_group_state` (`state`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合并支付单（预约 + 会员卡续费）';
-- 兼容「此前已建过 s_pay_group」的测试库：补齐分账台账字段（按列存在性判断，可重复执行）
SET @ddl = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `s_pay_group` ADD COLUMN `split_state` TINYINT NOT NULL DEFAULT 0 COMMENT ''分账状态 0待分账 1分账成功 2分账失败 3无需分账'' AFTER `paid_time`',
    'SELECT 1') FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 's_pay_group' AND COLUMN_NAME = 'split_state');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `s_pay_group` ADD COLUMN `split_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT ''应分给门店的金额（元）'' AFTER `split_state`',
    'SELECT 1') FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 's_pay_group' AND COLUMN_NAME = 'split_amount');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `s_pay_group` ADD COLUMN `split_pay_no` VARCHAR(64) DEFAULT NULL COMMENT ''分账请求流水号'' AFTER `split_amount`',
    'SELECT 1') FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 's_pay_group' AND COLUMN_NAME = 'split_pay_no');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `s_pay_group` ADD COLUMN `split_time` DATETIME DEFAULT NULL COMMENT ''分账时间'' AFTER `split_pay_no`',
    'SELECT 1') FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 's_pay_group' AND COLUMN_NAME = 'split_time');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `s_pay_group` ADD COLUMN `split_error` VARCHAR(255) DEFAULT NULL COMMENT ''分账失败原因'' AFTER `split_time`',
    'SELECT 1') FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 's_pay_group' AND COLUMN_NAME = 'split_error');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
