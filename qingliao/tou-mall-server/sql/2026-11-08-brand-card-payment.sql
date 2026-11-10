-- Full愈品牌会员卡：汇付小程序支付、退款与防薅羊毛锁
-- 日期：2026-11-08
-- 说明：仅用于测试/预发环境验证，正式环境执行前需二次确认。
--       所有 ALTER 均为幂等写法，可重复执行。

-- ============ 1. 开卡支付单：CRM 报价 / 汇付流水 / 退款 ============
SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_member_card_order` ADD COLUMN `product_code` VARCHAR(40) DEFAULT NULL COMMENT ''CRM 产品编码 FY_MONTH/FY_ANNUAL''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_member_card_order' AND column_name = 'product_code');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_member_card_order` ADD COLUMN `quote_id` VARCHAR(100) DEFAULT NULL COMMENT ''CRM 报价单号，30 分钟有效''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_member_card_order' AND column_name = 'quote_id');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_member_card_order` ADD COLUMN `crm_card_id` VARCHAR(100) DEFAULT NULL COMMENT ''CRM 开卡记录 id''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_member_card_order' AND column_name = 'crm_card_id');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_member_card_order` ADD COLUMN `paid_cents` INT DEFAULT NULL COMMENT ''实付金额（分）''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_member_card_order' AND column_name = 'paid_cents');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_member_card_order` ADD COLUMN `pay_channel` VARCHAR(20) DEFAULT NULL COMMENT ''支付渠道 WX_MINI''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_member_card_order' AND column_name = 'pay_channel');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_member_card_order` ADD COLUMN `mer_ord_id` VARCHAR(64) DEFAULT NULL COMMENT ''汇付请求单号''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_member_card_order' AND column_name = 'mer_ord_id');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_member_card_order` ADD COLUMN `hf_seq_id` VARCHAR(64) DEFAULT NULL COMMENT ''汇付全局流水号''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_member_card_order' AND column_name = 'hf_seq_id');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_member_card_order` ADD COLUMN `party_order_id` VARCHAR(64) DEFAULT NULL COMMENT ''微信侧支付单号''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_member_card_order' AND column_name = 'party_order_id');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_member_card_order` ADD COLUMN `out_trans_id` VARCHAR(64) DEFAULT NULL COMMENT ''微信侧交易号''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_member_card_order' AND column_name = 'out_trans_id');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_member_card_order` ADD COLUMN `refund_type` VARCHAR(20) DEFAULT NULL COMMENT ''WITHIN_7D 7天内扣年卡礼 / AFTER_7D 扣已省与年卡礼 / PRORATED 旧口径''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_member_card_order' AND column_name = 'refund_type');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_member_card_order` ADD COLUMN `used_benefit_cents` INT DEFAULT NULL COMMENT ''退款时已优惠金额（分）''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_member_card_order' AND column_name = 'used_benefit_cents');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_member_card_order` ADD COLUMN `refund_cents` INT DEFAULT NULL COMMENT ''应退金额（分）''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_member_card_order' AND column_name = 'refund_cents');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_member_card_order` ADD COLUMN `idempotency_key` VARCHAR(120) DEFAULT NULL COMMENT ''CRM 开卡/退款幂等键''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_member_card_order' AND column_name = 'idempotency_key');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_member_card_order` ADD COLUMN `refund_state` VARCHAR(20) NOT NULL DEFAULT ''NONE'' COMMENT ''NONE/PENDING/SUCCESS/FAILED''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_member_card_order' AND column_name = 'refund_state');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_member_card_order` ADD COLUMN `crm_refunded` TINYINT NOT NULL DEFAULT 0 COMMENT ''CRM 卡是否已撤销''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_member_card_order' AND column_name = 'crm_refunded');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_member_card_order` ADD COLUMN `refund_reason` VARCHAR(255) DEFAULT NULL COMMENT ''退款原因''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_member_card_order' AND column_name = 'refund_reason');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_member_card_order` ADD COLUMN `refund_operator_id` BIGINT DEFAULT NULL COMMENT ''后台操作人，小程序自助退款为空''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_member_card_order' AND column_name = 'refund_operator_id');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_member_card_order` ADD COLUMN `pay_error` VARCHAR(255) DEFAULT NULL COMMENT ''支付成功但开卡失败原因，便于后台核对''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_member_card_order' AND column_name = 'pay_error');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 汇付请求单号查询（回调兜底）
SET @idx = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_member_card_order` ADD KEY `idx_mer_ord_id` (`mer_ord_id`)',
  'SELECT 1') FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'c_member_card_order' AND index_name = 'idx_mer_ord_id');
PREPARE stmt FROM @idx; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============ 2. 客户：品牌会员购买锁 ============
SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_customer` ADD COLUMN `brand_card_locked` TINYINT NOT NULL DEFAULT 0 COMMENT ''1禁止购买品牌会员''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_customer' AND column_name = 'brand_card_locked');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_customer` ADD COLUMN `brand_card_lock_reason` VARCHAR(200) DEFAULT NULL COMMENT ''锁定原因''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_customer' AND column_name = 'brand_card_lock_reason');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_customer` ADD COLUMN `brand_card_locked_at` DATETIME DEFAULT NULL COMMENT ''锁定时间''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_customer' AND column_name = 'brand_card_locked_at');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============ 3. 退款流水（与支付流水分开，退款时保留原支付 hf_seq_id） ============
SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `c_member_card_order` ADD COLUMN `refund_hf_seq_id` VARCHAR(64) DEFAULT NULL COMMENT ''汇付退款流水号''',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'c_member_card_order' AND column_name = 'refund_hf_seq_id');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
