-- 仅隔离tou_mall_test。禁止mysql --force；默认admin-enabled=false，不开启真实发送。
-- 人员绑定与客户openid分表；随机nonce只存SHA-256摘要，短期候选openid确认后清除。
SET @fullyu_admin_notice_ddl=IF(DATABASE()='tou_mall_test',
'CREATE TABLE IF NOT EXISTS n_admin_mp_binding (
 admin_id BIGINT NOT NULL,
 app_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 open_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
 following INT NOT NULL DEFAULT 0,
 bound_at DATETIME NULL,
 event_at DATETIME NULL,
 PRIMARY KEY(admin_id,app_id),
 UNIQUE KEY uk_admin_mp_identity(app_id,open_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
'SELECT * FROM fullyu_admin_notice_migration_requires_tou_mall_test');
PREPARE fullyu_admin_notice_stmt FROM @fullyu_admin_notice_ddl;
EXECUTE fullyu_admin_notice_stmt;
DEALLOCATE PREPARE fullyu_admin_notice_stmt;

SET @fullyu_admin_notice_ddl=IF(DATABASE()='tou_mall_test',
'CREATE TABLE IF NOT EXISTS n_admin_mp_challenge (
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 admin_id BIGINT NOT NULL,
 app_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 expires_at DATETIME NOT NULL,
 consumed_at DATETIME NULL,
 candidate_open_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
 candidate_following INT NOT NULL DEFAULT 0,
 event_at DATETIME NULL,
 create_time DATETIME NOT NULL,
 PRIMARY KEY(token_hash),
 KEY idx_admin_challenge(admin_id,consumed_at),
 KEY idx_candidate_identity(app_id,candidate_open_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
'SELECT * FROM fullyu_admin_notice_migration_requires_tou_mall_test');
PREPARE fullyu_admin_notice_stmt FROM @fullyu_admin_notice_ddl;
EXECUTE fullyu_admin_notice_stmt;
DEALLOCATE PREPARE fullyu_admin_notice_stmt;

SET @fullyu_admin_notice_ddl=IF(DATABASE()='tou_mall_test',
'CREATE TABLE IF NOT EXISTS n_admin_mp_binding_audit (
 id BIGINT NOT NULL AUTO_INCREMENT,
 admin_id BIGINT NOT NULL,
 action VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 create_time DATETIME NOT NULL,
 PRIMARY KEY(id), KEY idx_binding_audit(admin_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
'SELECT * FROM fullyu_admin_notice_migration_requires_tou_mall_test');
PREPARE fullyu_admin_notice_stmt FROM @fullyu_admin_notice_ddl;
EXECUTE fullyu_admin_notice_stmt;
DEALLOCATE PREPARE fullyu_admin_notice_stmt;

SET @fullyu_admin_notice_ddl=IF(DATABASE()='tou_mall_test',
'CREATE TABLE IF NOT EXISTS n_admin_approval_generation (
 approval_id BIGINT NOT NULL,
 generation BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(approval_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
'SELECT * FROM fullyu_admin_notice_migration_requires_tou_mall_test');
PREPARE fullyu_admin_notice_stmt FROM @fullyu_admin_notice_ddl;
EXECUTE fullyu_admin_notice_stmt;
DEALLOCATE PREPARE fullyu_admin_notice_stmt;

SET @fullyu_admin_notice_ddl=IF(DATABASE()='tou_mall_test',
'CREATE TABLE IF NOT EXISTS n_admin_approval_notice (
 id BIGINT NOT NULL AUTO_INCREMENT,
 event_key VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 approval_id BIGINT NOT NULL,
 detail_id BIGINT NOT NULL,
 admin_id BIGINT NOT NULL,
 kind VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 approval_state INT NOT NULL,
 generation BIGINT NOT NULL DEFAULT 0,
 activation_at DATETIME NOT NULL,
 state VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 attempts INT NOT NULL DEFAULT 0,
 next_attempt_at DATETIME NOT NULL,
 create_time DATETIME NOT NULL,
 finish_time DATETIME NULL,
 PRIMARY KEY(id), UNIQUE KEY uk_approval_notice_event(event_key),
 KEY idx_notice_pending(state,next_attempt_at,id),
 KEY idx_admin_notice_owner(admin_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
'SELECT * FROM fullyu_admin_notice_migration_requires_tou_mall_test');
PREPARE fullyu_admin_notice_stmt FROM @fullyu_admin_notice_ddl;
EXECUTE fullyu_admin_notice_stmt;
DEALLOCATE PREPARE fullyu_admin_notice_stmt;

SET @fullyu_admin_notice_ddl=IF(DATABASE()='tou_mall_test',
'CREATE TABLE IF NOT EXISTS n_admin_approval_notice_attempt (
 id BIGINT NOT NULL AUTO_INCREMENT,
 notice_id BIGINT NOT NULL,
 attempt_no INT NOT NULL,
 status VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 template_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 create_time DATETIME NOT NULL,
 PRIMARY KEY(id), UNIQUE KEY uk_notice_attempt(notice_id,attempt_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
'SELECT * FROM fullyu_admin_notice_migration_requires_tou_mall_test');
PREPARE fullyu_admin_notice_stmt FROM @fullyu_admin_notice_ddl;
EXECUTE fullyu_admin_notice_stmt;
DEALLOCATE PREPARE fullyu_admin_notice_stmt;

-- 过期绑定凭证按expires_at分批清理所需索引；重复执行不重复建。
SET @fullyu_admin_notice_ddl=IF(DATABASE()!='tou_mall_test',
'SELECT * FROM fullyu_admin_notice_migration_requires_tou_mall_test',
IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE()
 AND table_name='n_admin_mp_challenge' AND index_name='idx_challenge_expiry')=0,
'ALTER TABLE n_admin_mp_challenge ADD INDEX idx_challenge_expiry (expires_at)','SELECT 1'));
PREPARE fullyu_admin_notice_stmt FROM @fullyu_admin_notice_ddl;
EXECUTE fullyu_admin_notice_stmt;
DEALLOCATE PREPARE fullyu_admin_notice_stmt;
