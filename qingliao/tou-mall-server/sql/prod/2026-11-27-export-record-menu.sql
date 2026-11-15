-- 【生产版】由 sql/2026-11-27-export-record-menu.sql 自动生成（scripts/make-prod-sql.py）。
-- 改动仅一处：把「仅测试库执行 / 非测试库就报错」的守卫改为无条件执行。
-- 执行前请备份；执行后跑 ./scripts/sql-audit.py 校验结构。
-- 2026-11-27 后台新增「导出台账」菜单（挂在「门店与系统」下，系统配置之后）
-- 背景：导出接口已由 ExportLogAspect 自动落库到 s_export_record，需要给超级管理员一个可查的入口
-- 授权：只授予「超级管理员」；页面与 /exportRecord/* 接口两端都会再校验角色
-- 依赖：必须先执行过 2026-11-11-admin-menu-tabs.sql（该脚本会重建 ums_menu）
-- 可重复执行；脚本只在 tou_mall_test 生效，生产版由 scripts/make-prod-sql.py 生成

SET @right_db = IF(DATABASE()<>'', 1, 0);

-- 1) 父级按 name 取「门店与系统」，不写死 id
SET @parent_id = (SELECT id FROM ums_menu WHERE name = 'staff' AND @right_db = 1 LIMIT 1);

-- 2) 排序：组内 门店团队 80 / 账号权限 79 / 系统配置 78，导出放在 77（系统配置之后）
INSERT INTO ums_menu (parent_id, create_time, title, level, sort, name, icon, hidden)
SELECT @parent_id, NOW(), '导出台账', 1, 77, 'exportRecord', 'document', 0
FROM DUAL
WHERE @right_db = 1
  AND @parent_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ums_menu WHERE name = 'exportRecord');

-- 3) 只授予超级管理员（按角色名匹配，避免写死 role_id）
INSERT INTO ums_role_menu_relation (role_id, menu_id)
SELECT r.id, m.id
FROM ums_role r
         JOIN ums_menu m ON m.name = 'exportRecord'
WHERE @right_db = 1
  AND r.name = '超级管理员'
  AND NOT EXISTS (
    SELECT 1 FROM ums_role_menu_relation x WHERE x.role_id = r.id AND x.menu_id = m.id
);

-- 4) 自检：应返回 2 行（菜单 1 行；只有当存在「超级管理员」角色时才有授权行）
SELECT id, parent_id, title, level, sort, name, icon, hidden FROM ums_menu WHERE name = 'exportRecord';
SELECT rm.role_id, r.name AS role_name
FROM ums_role_menu_relation rm
         JOIN ums_menu m ON m.id = rm.menu_id AND m.name = 'exportRecord'
         LEFT JOIN ums_role r ON r.id = rm.role_id;