-- 【生产版】由 sql/2026-11-08-coupon-notices.sql 自动生成（scripts/make-prod-sql.py）。
-- 改动仅一处：把「仅测试库执行 / 非测试库就报错」的守卫改为无条件执行。
-- 执行前请备份；执行后跑 ./scripts/sql-audit.py 校验结构。
-- 仅隔离 tou_mall_test；每条DDL独立校验数据库，禁止 mysql --force。
-- 无数据回填、不改已有券或会员账本。默认功能关闭，迁移后才能启用。
SET @fullyu_notice_ddl = IF(DATABASE()<>'',
'CREATE TABLE IF NOT EXISTS c_customer_notice (
 id BIGINT NOT NULL AUTO_INCREMENT,
 notice_key VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
 customer_id BIGINT NOT NULL,
 coupon_id BIGINT NOT NULL,
 end_time DATE NOT NULL,
 days INT NOT NULL,
 title VARCHAR(128) NOT NULL,
 body VARCHAR(512) NOT NULL,
 read_at DATETIME NULL,
 create_time DATETIME NOT NULL,
 PRIMARY KEY (id),
 UNIQUE KEY uk_notice_event (notice_key),
 KEY idx_notice_owner (customer_id,id),
 KEY idx_notice_unread (customer_id,read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
'SELECT * FROM fullyu_notice_migration_requires_tou_mall_test');
PREPARE fullyu_notice_stmt FROM @fullyu_notice_ddl;
EXECUTE fullyu_notice_stmt;
DEALLOCATE PREPARE fullyu_notice_stmt;

SET @fullyu_notice_ddl = IF(DATABASE()<>'',
'CREATE TABLE IF NOT EXISTS c_notice_subscription_consent (
 id BIGINT NOT NULL AUTO_INCREMENT,
 customer_id BIGINT NOT NULL,
 template_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
 decision VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
 request_id VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
 create_time DATETIME NOT NULL,
 PRIMARY KEY (id),
 UNIQUE KEY uk_consent_request (customer_id,request_id),
 KEY idx_consent_owner (customer_id,template_id,create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
'SELECT * FROM fullyu_notice_migration_requires_tou_mall_test');
PREPARE fullyu_notice_stmt FROM @fullyu_notice_ddl;
EXECUTE fullyu_notice_stmt;
DEALLOCATE PREPARE fullyu_notice_stmt;

-- 既有券表仅追加索引，重复执行不重复建索引，不修改券状态/余额。
SET @fullyu_notice_ddl = IF(1=0,
'SELECT * FROM fullyu_notice_migration_requires_tou_mall_test',
IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE()
 AND table_name='sms_customer_coupon' AND index_name='idx_coupon_notice_due')=0,
'ALTER TABLE sms_customer_coupon ADD INDEX idx_coupon_notice_due (state,end_time,id)', 'SELECT 1'));
PREPARE fullyu_notice_stmt FROM @fullyu_notice_ddl;
EXECUTE fullyu_notice_stmt;
DEALLOCATE PREPARE fullyu_notice_stmt;

-- append-only评估日志：MOCK不等于发送/送达；未授权、缺模板、live被阻止分开记录。
SET @fullyu_notice_ddl = IF(DATABASE()<>'',
'CREATE TABLE IF NOT EXISTS c_notice_delivery_log (
 id BIGINT NOT NULL AUTO_INCREMENT,
 notice_key VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
 customer_id BIGINT NOT NULL,
 channel VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
 status VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
 template_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
 create_time DATETIME NOT NULL,
 PRIMARY KEY (id),
 UNIQUE KEY uk_delivery_event (notice_key,channel),
 KEY idx_delivery_owner (customer_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
'SELECT * FROM fullyu_notice_migration_requires_tou_mall_test');
PREPARE fullyu_notice_stmt FROM @fullyu_notice_ddl;
EXECUTE fullyu_notice_stmt;
DEALLOCATE PREPARE fullyu_notice_stmt;

-- 一次性订阅配额：每条accept最多被一条提醒事件占用；NULL表示未使用，唯一键防止一事件占多条。
SET @fullyu_notice_ddl = IF(1=0,
'SELECT * FROM fullyu_notice_migration_requires_tou_mall_test',
IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE()
 AND table_name='c_notice_subscription_consent' AND column_name='used_notice_key')=0,
'ALTER TABLE c_notice_subscription_consent ADD COLUMN used_notice_key VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL, ADD UNIQUE KEY uk_consent_used_notice (used_notice_key)', 'SELECT 1'));
PREPARE fullyu_notice_stmt FROM @fullyu_notice_ddl;
EXECUTE fullyu_notice_stmt;
DEALLOCATE PREPARE fullyu_notice_stmt;
