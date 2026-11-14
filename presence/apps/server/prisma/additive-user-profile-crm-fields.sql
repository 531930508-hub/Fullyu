-- 会员资料（性别 / 生日）与 CRM 同口径：在场本地只存展示副本，CRM 是账本。
-- 纯 additive：只加列，不动既有数据；部署前手工执行，或由 CI 的 db push 补齐（缺列会被漂移闸门拦下）。
ALTER TABLE `users`
  ADD COLUMN `gender` INT NULL COMMENT '性别：1=男 2=女；NULL=未设置，与 CRM member.gender 同口径' AFTER `language`,
  ADD COLUMN `birthday` DATE NULL COMMENT '生日（只到日期），与 CRM member.birthday 同口径' AFTER `gender`;