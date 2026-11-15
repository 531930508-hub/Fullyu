-- 【生产版】由 sql/2026-11-24-incentive-internal-accounts.sql 自动生成（scripts/make-prod-sql.py）。
-- 改动仅一处：把「仅测试库执行 / 非测试库就报错」的守卫改为无条件执行。
-- 执行前请备份；执行后跑 ./scripts/sql-audit.py 校验结构。
-- Full愈 · 统计排除内部账号：初始化两条内部测试手机号
-- 适用：MySQL 5.7/8.0，可重复执行。
-- 背景：s_stat_internal_account 表已随 2026-10-21-incentive-v5.sql 建好，
--       这里只补初始化数据；后台「奖励参数 → 统计排除」可继续维护。
-- 说明：名单内手机号在订单、复购与留存口径中一次性排除，历史月份看板同步生效。

INSERT INTO s_stat_internal_account (phone, enabled, remark, create_time)
VALUES
    ('16601701717', 1, '内部测试账号', NOW()),
    ('13299030286', 1, '内部测试账号', NOW())
ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), remark = VALUES(remark);