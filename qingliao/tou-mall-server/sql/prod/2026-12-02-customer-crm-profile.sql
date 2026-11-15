-- 【生产版】由 sql/2026-12-02-customer-crm-profile.sql 自动生成（scripts/make-prod-sql.py）。
-- 改动仅一处：把「仅测试库执行 / 非测试库就报错」的守卫改为无条件执行。
-- 执行前请备份；执行后跑 ./scripts/sql-audit.py 校验结构。
-- 2026-12-02 会员资料（昵称/头像/性别/生日）以 CRM 为唯一归档
-- 背景：小程序个人中心、后台预约、品牌卡开通表单各改各的，同一顾客在不同端看到的资料不一致。
--       阿里品牌中心 CRM 新增 PATCH /api/v1/brand-member/profile，带 profileVersion 乐观锁，
--       本端只做代理与镜像：crm_profile_version 记录本地已同步/已推送到的 CRM 版本，
--       crm_profile_synced_at 记录最近一次同步时间（排查用）。
-- 注意：手机号不进资料同步——CRM c_customer.phone 是身份唯一键，改号只在 CRM 侧做。
-- 可重复执行；脚本只在 tou_mall_test 生效，生产版由 scripts/make-prod-sql.py 生成

SET @right_db = IF(DATABASE()<>'', 1, 0);

SET @ddl = (SELECT IF(@right_db = 1 AND COUNT(*) = 0,
    'ALTER TABLE c_customer ADD COLUMN crm_profile_version BIGINT NULL COMMENT ''CRM 会员资料版本号(profileVersion)，本地已同步的版本''',
    'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'c_customer'
      AND COLUMN_NAME = 'crm_profile_version');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(@right_db = 1 AND COUNT(*) = 0,
    'ALTER TABLE c_customer ADD COLUMN crm_profile_synced_at DATETIME NULL COMMENT ''CRM 会员资料最近同步时间(本地时区)''',
    'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'c_customer'
      AND COLUMN_NAME = 'crm_profile_synced_at');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 自检：应返回 crm_profile_version / bigint / YES 与 crm_profile_synced_at / datetime / YES
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'c_customer'
  AND COLUMN_NAME IN ('crm_profile_version', 'crm_profile_synced_at')
ORDER BY COLUMN_NAME;