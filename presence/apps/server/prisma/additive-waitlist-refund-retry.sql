-- Full愈 · 候补自动退款重试控制（只新增列，不删除、不修改既有列）
-- 背景：2026-11 线上 4 条候补自动退款被网关拒绝后，任务每 5 分钟重新发起一次，
--       每次都新增一条 order_refunds，累计刷出 2332 条流水。
--       新增三列用于「失败次数 + 退避时间 + 失败原因」，达到上限后转人工，不再自动重试。
-- 适用：MySQL 8（阿里云 RDS）
-- 执行：npx prisma db execute --file prisma/additive-waitlist-refund-retry.sql --schema prisma/schema.prisma
-- 注意：本文件可单独审计；不要用 prisma db push / migrate，避免触及其他人工维护的表。

ALTER TABLE `waitlist_entries`
  ADD COLUMN `refund_attempts` INT NOT NULL DEFAULT 0 COMMENT '候补自动退款已失败次数',
  ADD COLUMN `refund_next_retry_at` DATETIME(3) NULL COMMENT '下次允许自动重试的时间（退避）',
  ADD COLUMN `refund_last_error` TEXT NULL COMMENT '最近一次退款失败原因；[需人工] 前缀表示已停止自动重试';