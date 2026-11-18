-- CRM · 会员码「仅限新会员」（只新增列，不删除、不改动既有数据）
-- 适用：MySQL 8（阿里云 RDS）
-- 执行：npx prisma db execute --file prisma/additive-gift-new-member.sql --schema prisma/schema.prisma
-- 背景：30 天体验码被已有付费会员重复领取，体验名额没有落到真正的新客。
-- 领取时校验会员是否持有过付费卡：线上实付 PAID 或线下实收 MANUAL（paidCents > 0）；
--   已退款（REFUNDED）、已过期（EXPIRED）也算「买过」；赠送卡 GIFT 与畅练卡附赠 BUNDLE 不算购买。
-- 注意：历史活动默认 0（不限领取对象），需要限制的在后台新建/重发活动时勾选「仅限新会员」。

ALTER TABLE `gift_campaigns` ADD COLUMN `new_member_only` BOOLEAN NOT NULL DEFAULT FALSE;