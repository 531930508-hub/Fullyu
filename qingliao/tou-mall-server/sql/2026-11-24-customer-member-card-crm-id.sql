-- 2026-11-24 客户会员卡增加 CRM 卡账本 id（对账同步的幂等键）
-- 背景：CRM 的 GET /v1/brand-member/cards 下发卡账本后，轻疗按 crmCardId upsert 本地权益期。
--       同步是「按 updatedAt 增量 + 可重放」的，所以必须有唯一键兜底，避免重跑出两张卡。
-- 依赖：c_customer_member_card（2026-11-07-member-card.sql）、c_member_card_order.crm_card_id（2026-11-08-brand-card-payment.sql）
-- 可重复执行；脚本只在 tou_mall_test 生效，生产版由 scripts/make-prod-sql.py 生成

SET @right_db = IF(DATABASE()='tou_mall_test', 1, 0);

-- 1. 加列：CRM 卡账本 cardId
SET @ddl = (SELECT IF(@right_db = 1 AND COUNT(*) = 0,
    'ALTER TABLE `c_customer_member_card` ADD COLUMN `crm_card_id` VARCHAR(100) DEFAULT NULL COMMENT ''CRM 卡账本 cardId，同步幂等键''',
    'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'c_customer_member_card'
      AND COLUMN_NAME = 'crm_card_id');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 唯一键：同一张 CRM 卡只能落一条本地权益期（NULL 不参与唯一）
SET @ddl = (SELECT IF(@right_db = 1 AND COUNT(*) = 0,
    'ALTER TABLE `c_customer_member_card` ADD UNIQUE KEY `uk_crm_card_id` (`crm_card_id`)',
    'SELECT 1')
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'c_customer_member_card'
      AND INDEX_NAME = 'uk_crm_card_id');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. 回填：小程序已开通的卡，开卡支付单上记了 crm_card_id，反填到权益期
--    （同步上线前开的卡没有这个值，靠回填才不会在首轮同步里被当成「新增」）
UPDATE `c_customer_member_card` c
  JOIN (SELECT `card_id`, MIN(`crm_card_id`) AS `crm_card_id`
          FROM `c_member_card_order`
         WHERE `card_id` IS NOT NULL AND `crm_card_id` IS NOT NULL AND `crm_card_id` <> ''
         GROUP BY `card_id`) o ON o.`card_id` = c.`id`
   SET c.`crm_card_id` = o.`crm_card_id`
 WHERE @right_db = 1
   AND (c.`crm_card_id` IS NULL OR c.`crm_card_id` <> o.`crm_card_id`);