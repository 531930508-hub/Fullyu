-- 2026-11-23 请假内置规则：二级审批人（总部CEO）改由审批配置指定
-- 背景：请假没配流程节点时走内置规则「店长 → 总部CEO（二级）」，此前二级审批人写死在配置项
--       approval.leave.second-approver-admin-id，换人得改配置文件重启；改到 f_approval_category 上，
--       管理员在「设置 → 审批设置 → 请假」里直接选账号即可。
-- 口径：只有 code=askForLeave 且没有流程节点的配置会用这一列；其它类别保持 NULL。
--       老配置升级后该列是 NULL，当天请假/店长本人请假会被拦下并提示去审批设置里指定，不会静默放过。
-- 可重复执行；脚本只在 tou_mall_test 生效，生产版由 scripts/make-prod-sql.py 生成

SET @right_db = IF(DATABASE()='tou_mall_test', 1, 0);

-- 1. 审批类型加“请假二级审批人”列：存 ums_admin 主键，不存手机号/姓名，换人只改这一列
SET @ddl = (SELECT IF(@right_db = 1 AND COUNT(*) = 0,
    'ALTER TABLE f_approval_category ADD COLUMN second_approver_admin_id bigint DEFAULT NULL COMMENT ''请假内置规则的二级审批人（总部CEO）后台账号id''',
    'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'f_approval_category'
      AND COLUMN_NAME = 'second_approver_admin_id');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 校验：列的注释能对上，避免生产上手工执行成别的语义
SET @check = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'f_approval_category'
      AND COLUMN_NAME = 'second_approver_admin_id');
SELECT IF(@right_db = 0 OR @check = 1, 'ok', 'f_approval_category.second_approver_admin_id 缺失') AS result;