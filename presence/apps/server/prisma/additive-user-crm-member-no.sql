-- CRM 会员号映射：CRM 品牌卡推送只带 memberNo，靠这条映射反查本地账号、精确清权益缓存。
-- 纯 additive：只加列 + 唯一索引，不动既有数据；部署前手工执行，或由 CI 的 db push 补齐。
ALTER TABLE `users`
  ADD COLUMN `crm_member_no` VARCHAR(64) NULL COMMENT 'CRM 会员号，推送反查本地账号用' AFTER `birthday`,
  ADD UNIQUE INDEX `users_crm_member_no_key` (`crm_member_no`);