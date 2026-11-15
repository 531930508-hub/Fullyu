-- 2026-11-26 会员卡取消「当日会员价」，只保留提前一天及以上会员价
-- 目标库：tou_mall_demo / 生产；生产库执行前请确认已备份。脚本可重复执行。
-- 说明：
--   1. s_member_card_config.same_day_rate 保留字段（NOT NULL），统一写 1.0000 作为历史占位，
--      服务端不再读取，开卡与配置保存时也固定写 1.0000。
--   2. c_customer_member_card.same_day_rate 为已开卡的历史快照，保持原值不回溯，仅用于读取旧订单/旧卡展示。

-- 1) 卡产品配置：当日折扣率统一为 1.0000（不打折，等价于取消）
UPDATE `s_member_card_config`
SET `same_day_rate` = 1.0000,
    `update_time` = NOW()
WHERE `same_day_rate` <> 1.0000;

-- 2) 注释改为历史字段，避免后续运营误用
ALTER TABLE `s_member_card_config`
  MODIFY COLUMN `same_day_rate` DECIMAL(5,4) NOT NULL DEFAULT 1.0000
  COMMENT '历史字段-当日预约折扣率（已取消，固定 1.0000，结算不读取）';

ALTER TABLE `c_customer_member_card`
  MODIFY COLUMN `same_day_rate` DECIMAL(5,4) NOT NULL
  COMMENT '开卡快照-历史字段当日预约折扣率（已取消，仅旧卡/旧订单读取）';