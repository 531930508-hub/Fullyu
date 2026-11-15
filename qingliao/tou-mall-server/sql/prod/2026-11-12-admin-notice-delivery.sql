-- 【生产版】由 sql/2026-11-12-admin-notice-delivery.sql 自动生成（scripts/make-prod-sql.py）。
-- 改动仅一处：把「仅测试库执行 / 非测试库就报错」的守卫改为无条件执行。
-- 执行前请备份；执行后跑 ./scripts/sql-audit.py 校验结构。
-- 仅隔离tou_mall_test。为真实模板消息补投递结果字段，重复执行安全。
SET @fullyu_admin_notice_ddl=IF(1=0,
'SELECT * FROM fullyu_admin_notice_migration_requires_tou_mall_test',
IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE()
 AND table_name='n_admin_approval_notice' AND column_name='last_result')=0,
'ALTER TABLE n_admin_approval_notice ADD COLUMN last_result VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL AFTER finish_time',
'SELECT 1'));
PREPARE fullyu_admin_notice_stmt FROM @fullyu_admin_notice_ddl;
EXECUTE fullyu_admin_notice_stmt;
DEALLOCATE PREPARE fullyu_admin_notice_stmt;

SET @fullyu_admin_notice_ddl=IF(1=0,
'SELECT * FROM fullyu_admin_notice_migration_requires_tou_mall_test',
IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE()
 AND table_name='n_admin_approval_notice_attempt' AND column_name='result')=0,
'ALTER TABLE n_admin_approval_notice_attempt ADD COLUMN result VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL AFTER status',
'SELECT 1'));
PREPARE fullyu_admin_notice_stmt FROM @fullyu_admin_notice_ddl;
EXECUTE fullyu_admin_notice_stmt;
DEALLOCATE PREPARE fullyu_admin_notice_stmt;