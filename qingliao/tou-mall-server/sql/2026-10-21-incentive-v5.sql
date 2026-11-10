-- Full愈 V5 疗愈师接单奖励看板
-- 适用：MySQL 5.7/8.0，执行前请先备份。
-- 说明：
--   1. 本脚本只新增表/字段，不删除、不改写任何现有业务数据。
--   2. s_massagist.entry_day 若已存在请跳过对应 ALTER，避免重复执行报错。
--   3. 参数与培训项目只在“系统尚无任何生效参数”时写入默认版本；
--      已有参数时不会覆盖，请登录后台在参数设置中维护并保存新版本。
--   4. 默认培训项目未绑定 s_project.id，需要运营在参数设置中绑定后才会按项目 ID 精确匹配。

-- ---------------------------------------------------------------------------
-- 1. 疗愈师加入日期（累计成就起算）
-- ---------------------------------------------------------------------------
ALTER TABLE s_massagist
    ADD COLUMN entry_day DATE NULL COMMENT '加入日期，用于累计成就起算；为空回退最早有效服务日';

-- ---------------------------------------------------------------------------
-- 2. 激励参数版本
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS s_incentive_config (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
    effective_month CHAR(7) NOT NULL COMMENT '生效月份 yyyy-MM',
    revision INT NOT NULL DEFAULT 1 COMMENT '同月修订号，从 1 开始',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '1生效 0历史',
    new_coefficient DECIMAL(8,4) NOT NULL DEFAULT 0.8000 COMMENT '新人合作期系数',
    retention_threshold DECIMAL(6,2) NOT NULL DEFAULT 60.00 COMMENT '老客60天留存门槛（百分数）',
    min_new_sample INT NOT NULL DEFAULT 30 COMMENT '新客30天档位最小样本',
    retention_months INT NOT NULL DEFAULT 6 COMMENT '老客留存统计月数',
    retention_end_offset INT NOT NULL DEFAULT 2 COMMENT '留存窗口结束月相对当前月的偏移',
    conversion_months INT NOT NULL DEFAULT 3 COMMENT '新客30天复购统计月数',
    conversion_end_offset INT NOT NULL DEFAULT 1 COMMENT '30天复购窗口结束月偏移',
    conversion_days INT NOT NULL DEFAULT 30 COMMENT '新客复购天数',
    ten_day_days INT NOT NULL DEFAULT 10 COMMENT '新客10天复购天数',
    fib_a1 DECIMAL(12,2) NOT NULL DEFAULT 10.00 COMMENT '斐波那契首项',
    fib_a2 DECIMAL(12,2) NOT NULL DEFAULT 10.00 COMMENT '斐波那契次项',
    fib_cap DECIMAL(12,2) NOT NULL DEFAULT 130.00 COMMENT '单笔封顶单价',
    remark VARCHAR(500) NULL COMMENT '版本备注',
    create_user_id BIGINT NULL COMMENT '创建人后台账号ID',
    create_time DATETIME NULL COMMENT '创建时间',
    update_time DATETIME NULL COMMENT '更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_incentive_config_month_revision (effective_month, revision),
    KEY idx_incentive_config_status_month (status, effective_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='激励参数版本';

CREATE TABLE IF NOT EXISTS s_incentive_coefficient (
    id BIGINT NOT NULL AUTO_INCREMENT,
    config_id BIGINT NOT NULL COMMENT '参数版本ID',
    min_minutes BIGINT NOT NULL COMMENT '区间起点（分钟，左闭）',
    coefficient DECIMAL(8,4) NOT NULL COMMENT '基础系数',
    sort INT NOT NULL DEFAULT 0,
    create_time DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_incentive_coefficient (config_id, min_minutes)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='基础接单奖励时长档位';

CREATE TABLE IF NOT EXISTS s_incentive_tier (
    id BIGINT NOT NULL AUTO_INCREMENT,
    config_id BIGINT NOT NULL COMMENT '参数版本ID',
    rate DECIMAL(6,2) NOT NULL COMMENT '复购率达到的百分数',
    amount DECIMAL(12,2) NOT NULL COMMENT '达到档位的奖励金额',
    sort INT NOT NULL DEFAULT 0,
    create_time DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_incentive_tier (config_id, rate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='新客30天复购档位';

-- ---------------------------------------------------------------------------
-- 3. 培训项目与考核记录
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS s_training_project_config (
    id BIGINT NOT NULL AUTO_INCREMENT,
    config_id BIGINT NOT NULL COMMENT '参数版本ID',
    project_key VARCHAR(64) NOT NULL COMMENT '稳定项目编码',
    project_group VARCHAR(64) NULL COMMENT '项目分组',
    project_name VARCHAR(128) NOT NULL COMMENT '展示名称',
    project_id BIGINT NULL COMMENT '线上项目ID，为空时按部位/时长匹配',
    part_name VARCHAR(64) NULL COMMENT '部位名称',
    aliases VARCHAR(255) NULL COMMENT '逗号分隔的匹配别名',
    duration_minutes INT NULL COMMENT '要求的服务时长（分钟）',
    target_count INT NOT NULL DEFAULT 5 COMMENT '目标有效订单数',
    amount DECIMAL(12,2) NOT NULL DEFAULT 500.00 COMMENT '达标当月补贴金额',
    enabled TINYINT NOT NULL DEFAULT 1 COMMENT '1启用 0停用',
    sort INT NOT NULL DEFAULT 0,
    create_time DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_training_project_key (config_id, project_key),
    KEY idx_training_project_config (config_id, enabled, sort)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='培训补贴项目配置';

CREATE TABLE IF NOT EXISTS s_massagist_training_cert (
    id BIGINT NOT NULL AUTO_INCREMENT,
    massagist_id BIGINT NOT NULL COMMENT '疗愈师ID',
    shop_id BIGINT NULL COMMENT '登记时所属门店',
    project_key VARCHAR(64) NOT NULL COMMENT '培训项目编码',
    passed_at DATE NOT NULL COMMENT '通过考核日期',
    certifier_id BIGINT NULL COMMENT '登记人后台账号ID',
    certifier_name VARCHAR(64) NULL COMMENT '登记人名称',
    remark VARCHAR(500) NULL,
    create_time DATETIME NULL,
    update_time DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_massagist_project (massagist_id, project_key),
    KEY idx_cert_shop_passed (shop_id, passed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='疗愈师培训项目考核记录';

CREATE TABLE IF NOT EXISTS s_massagist_training_cert_log (
    id BIGINT NOT NULL AUTO_INCREMENT,
    cert_id BIGINT NULL COMMENT '考核记录ID',
    massagist_id BIGINT NOT NULL,
    shop_id BIGINT NULL,
    project_key VARCHAR(64) NOT NULL,
    action VARCHAR(16) NOT NULL COMMENT 'CREATE/UPDATE/DELETE',
    old_passed_at DATE NULL,
    new_passed_at DATE NULL,
    operator_id BIGINT NULL,
    operator_name VARCHAR(64) NULL,
    remark VARCHAR(500) NULL,
    create_time DATETIME NULL,
    PRIMARY KEY (id),
    KEY idx_cert_log_massagist (massagist_id, project_key, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='考核记录变更日志';

-- ---------------------------------------------------------------------------
-- 4. 门店目标、店长提点与统计排除账号
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS s_shop_incentive_target (
    id BIGINT NOT NULL AUTO_INCREMENT,
    shop_id BIGINT NOT NULL,
    month_code CHAR(7) NOT NULL COMMENT '目标月份 yyyy-MM',
    target_revenue DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT '整店实际业绩目标',
    commission_rate DECIMAL(6,2) NOT NULL DEFAULT 0.00 COMMENT '达成后按整店实收提点百分数',
    manager_massagist_id BIGINT NULL COMMENT '店长疗愈师ID，仅本人可见',
    config_id BIGINT NULL COMMENT '保存时适用的参数版本',
    remark VARCHAR(500) NULL,
    create_user_id BIGINT NULL,
    create_time DATETIME NULL,
    update_time DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_shop_incentive_target (shop_id, month_code),
    KEY idx_shop_target_month (month_code),
    KEY idx_shop_target_manager (manager_massagist_id, month_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='门店月度业绩目标与店长提点';

CREATE TABLE IF NOT EXISTS s_stat_internal_account (
    id BIGINT NOT NULL AUTO_INCREMENT,
    phone VARCHAR(32) NOT NULL COMMENT '需要从服务统计排除的手机号',
    enabled TINYINT NOT NULL DEFAULT 1,
    remark VARCHAR(255) NULL,
    create_time DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_stat_internal_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='统计排除的内部账号手机号';

-- ---------------------------------------------------------------------------
-- 5. 默认参数与 8 个培训项目（仅首次初始化）
-- ---------------------------------------------------------------------------
SET @incentive_seeded := 0;
INSERT INTO s_incentive_config
    (effective_month, revision, status, new_coefficient, retention_threshold,
     min_new_sample, retention_months, retention_end_offset, conversion_months,
     conversion_end_offset, conversion_days, ten_day_days, fib_a1, fib_a2,
     fib_cap, remark, create_time, update_time)
SELECT DATE_FORMAT(CURDATE(), '%Y-%m'), 1, 1, 0.8000, 60.00,
       30, 6, 2, 3, 1, 30, 10, 10.00, 10.00, 130.00,
       'V5 初始化默认参数', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM s_incentive_config WHERE status = 1);
SET @incentive_seeded := ROW_COUNT();
SET @incentive_config_id := IF(@incentive_seeded > 0, LAST_INSERT_ID(), NULL);

INSERT INTO s_incentive_coefficient (config_id, min_minutes, coefficient, sort, create_time)
SELECT @incentive_config_id, 0, 1.0000, 0, NOW() FROM DUAL
WHERE @incentive_config_id IS NOT NULL
UNION ALL SELECT @incentive_config_id, 7200, 1.2000, 1, NOW() FROM DUAL
WHERE @incentive_config_id IS NOT NULL
UNION ALL SELECT @incentive_config_id, 8400, 1.3000, 2, NOW() FROM DUAL
WHERE @incentive_config_id IS NOT NULL
UNION ALL SELECT @incentive_config_id, 9600, 1.5000, 3, NOW() FROM DUAL
WHERE @incentive_config_id IS NOT NULL;

INSERT INTO s_incentive_tier (config_id, rate, amount, sort, create_time)
SELECT @incentive_config_id, 10.00, 200.00, 0, NOW() FROM DUAL
WHERE @incentive_config_id IS NOT NULL
UNION ALL SELECT @incentive_config_id, 12.00, 400.00, 1, NOW() FROM DUAL
WHERE @incentive_config_id IS NOT NULL
UNION ALL SELECT @incentive_config_id, 15.00, 800.00, 2, NOW() FROM DUAL
WHERE @incentive_config_id IS NOT NULL
UNION ALL SELECT @incentive_config_id, 18.00, 1100.00, 3, NOW() FROM DUAL
WHERE @incentive_config_id IS NOT NULL
UNION ALL SELECT @incentive_config_id, 20.00, 1500.00, 4, NOW() FROM DUAL
WHERE @incentive_config_id IS NOT NULL;

INSERT INTO s_training_project_config
    (config_id, project_key, project_group, project_name, project_id, part_name,
     aliases, duration_minutes, target_count, amount, enabled, sort, create_time)
SELECT @incentive_config_id, 'sujin_face', '全感舒筋', '全感舒筋 · 面部', NULL, '面部',
       '脸,面部', NULL, 5, 500.00, 1, 1, NOW() FROM DUAL
WHERE @incentive_config_id IS NOT NULL
UNION ALL SELECT @incentive_config_id, 'sujin_hand', '全感舒筋', '全感舒筋 · 手部', NULL, '手部',
       '手,手部', NULL, 5, 500.00, 1, 2, NOW() FROM DUAL
WHERE @incentive_config_id IS NOT NULL
UNION ALL SELECT @incentive_config_id, 'sujin_head', '全感舒筋', '全感舒筋 · 头部', NULL, '头部',
       '头,头部', NULL, 5, 500.00, 1, 3, NOW() FROM DUAL
WHERE @incentive_config_id IS NOT NULL
UNION ALL SELECT @incentive_config_id, 'sujin_shoulder', '全感舒筋', '全感舒筋 · 肩部', NULL, '肩部',
       '肩,肩颈,肩部', NULL, 5, 500.00, 1, 4, NOW() FROM DUAL
WHERE @incentive_config_id IS NOT NULL
UNION ALL SELECT @incentive_config_id, 'sujin_eye', '全感舒筋', '全感舒筋 · 眼部', NULL, '眼部',
       '眼,眼部', NULL, 5, 500.00, 1, 5, NOW() FROM DUAL
WHERE @incentive_config_id IS NOT NULL
UNION ALL SELECT @incentive_config_id, 'sujin_leg', '全感舒筋', '全感舒筋 · 腿部', NULL, '腿部',
       '腿,腿部', NULL, 5, 500.00, 1, 6, NOW() FROM DUAL
WHERE @incentive_config_id IS NOT NULL
UNION ALL SELECT @incentive_config_id, 'head_spa_60', '头部水疗', '头部水疗 · 60 分钟', NULL, '头部水疗',
       '水疗,头部水疗', 60, 5, 500.00, 1, 7, NOW() FROM DUAL
WHERE @incentive_config_id IS NOT NULL
UNION ALL SELECT @incentive_config_id, 'head_spa_90', '头部水疗', '头部水疗 · 90 分钟', NULL, '头部水疗',
       '水疗,头部水疗', 90, 5, 500.00, 1, 8, NOW() FROM DUAL
WHERE @incentive_config_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. 后台菜单（按 route.name 与前端路由匹配）
--    默认授权给超级管理员/总助/运营/财务/店长/admin；
--    若实际环境没有“店长”角色，该条件不会命中任何记录，不影响执行。
--    其他角色请在“权限 -> 角色列表 -> 分配菜单”中按需勾选。
-- ---------------------------------------------------------------------------
INSERT INTO ums_menu (parent_id, create_time, title, level, sort, name, icon, hidden)
SELECT 0, NOW(), '接单奖励', 1, 90, 'incentive', 'salary', 0
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM ums_menu WHERE name = 'incentive');
SET @incentive_menu_id := (SELECT id FROM ums_menu WHERE name = 'incentive' LIMIT 1);

INSERT INTO ums_menu (parent_id, create_time, title, level, sort, name, icon, hidden)
SELECT @incentive_menu_id, NOW(), '经营看板', 2, 10, 'incentiveBoard', 'dashboard', 0
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM ums_menu WHERE name = 'incentiveBoard');
INSERT INTO ums_menu (parent_id, create_time, title, level, sort, name, icon, hidden)
SELECT @incentive_menu_id, NOW(), '培训考核', 2, 20, 'incentiveTraining', 'comment', 0
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM ums_menu WHERE name = 'incentiveTraining');
INSERT INTO ums_menu (parent_id, create_time, title, level, sort, name, icon, hidden)
SELECT @incentive_menu_id, NOW(), '奖励参数', 2, 30, 'incentiveSettings', 'salarySet', 0
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM ums_menu WHERE name = 'incentiveSettings');

INSERT INTO ums_role_menu_relation (role_id, menu_id)
SELECT r.id, m.id
FROM ums_role r
JOIN ums_menu m ON m.name IN ('incentive', 'incentiveBoard', 'incentiveTraining', 'incentiveSettings')
WHERE r.name IN ('超级管理员', '总助', '运营', '财务', '店长', 'admin')
  AND NOT EXISTS (
      SELECT 1 FROM ums_role_menu_relation rm
      WHERE rm.role_id = r.id AND rm.menu_id = m.id
  );
