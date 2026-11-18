-- 【生产版】由 sql/2026-11-18-page-event.sql 自动生成（scripts/make-prod-sql.py）。
-- 改动仅一处：把「仅测试库执行 / 非测试库就报错」的守卫改为无条件执行。
-- 执行前请备份；执行后跑 ./scripts/sql-audit.py 校验结构。
-- 小程序页面埋点明细表（test 库）。
-- 生产发布前需单独执行（去掉 DATABASE() 守卫），或在生产库手工建表。
-- 一行 = 一个顾客（或一次会话）在一个页面的一段停留。
SET @fullyu_page_event_ddl=IF(DATABASE()<>'',
'CREATE TABLE IF NOT EXISTS n_page_event (
 id BIGINT NOT NULL AUTO_INCREMENT,
 customer_id BIGINT NULL COMMENT ''顾客id，未登录为空'',
 session_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT ''一次冷启动为一个会话'',
 page_path VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
 page_title VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
 from_page VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
 scene VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT ''微信场景值'',
 enter_time DATETIME NULL,
 leave_time DATETIME NULL,
 stay_duration INT NOT NULL DEFAULT 0 COMMENT ''停留毫秒'',
 app_version VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
 device_info VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
 create_time DATETIME NOT NULL,
 PRIMARY KEY(id),
 KEY idx_pe_create_time(create_time),
 KEY idx_pe_customer(customer_id,create_time),
 KEY idx_pe_path(page_path,create_time),
 KEY idx_pe_session(session_id),
 KEY idx_pe_scene(scene,create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT=''小程序页面停留埋点''',
'SELECT * FROM fullyu_page_event_migration_requires_tou_mall_test');
PREPARE fullyu_page_event_stmt FROM @fullyu_page_event_ddl;
EXECUTE fullyu_page_event_stmt;
DEALLOCATE PREPARE fullyu_page_event_stmt;
