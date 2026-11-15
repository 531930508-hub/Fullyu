-- 【生产版】由 sql/2026-11-28-board-change-log-menu.sql 自动生成（scripts/make-prod-sql.py）。
-- 改动仅一处：把「仅测试库执行 / 非测试库就报错」的守卫改为无条件执行。
-- 执行前请备份；执行后跑 ./scripts/sql-audit.py 校验结构。
-- 2026-11-28 后台新增「变动日志」二级菜单（挂在「预约与订单」下，排班看板之后）
-- 背景：排班看板的新增/调店/清除等改动已由 recordScheduleChange 落库到 c_controller_log（source=schedule-audit），
--       原先只能在「排班与请假」里点「操作记录」抽屉查看，本次单独成页，便于按门店/疗愈师/日期排查。
-- 授权：沿用「已有排班看板权限的角色」自动授权，但排除只读角色「疗愈师」（只读看板不开放日志）。
-- 依赖：必须先执行过 2026-11-11-admin-menu-tabs.sql（该脚本会重建 ums_menu）
-- 可重复执行；脚本只在 tou_mall_test 生效，生产版由 scripts/make-prod-sql.py 生成

SET @right_db = IF(DATABASE()<>'', 1, 0);

-- 1) 父级按 name 取「预约与订单」，不写死 id
SET @parent_id = (SELECT id FROM ums_menu WHERE name = 'booking' AND @right_db = 1 LIMIT 1);

-- 2) 组内排序：预约列表 80 / 排班看板 79 / 排班与请假 78 / 订单列表 77，变动日志放在看板之后（79 与 78 之间取 79 的下一档）
INSERT INTO ums_menu (parent_id, create_time, title, level, sort, name, icon, hidden)
SELECT @parent_id, NOW(), '变动日志', 1, 79, 'boardLogs', 'approval', 0
FROM DUAL
WHERE @right_db = 1
  AND @parent_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ums_menu WHERE name = 'boardLogs');

-- 3) 授予已有「排班看板」权限的角色（疗愈师只读看板，看板权限只给查看不给日志）
INSERT INTO ums_role_menu_relation (role_id, menu_id)
SELECT DISTINCT rm.role_id, log_menu.id
FROM ums_role_menu_relation rm
         JOIN ums_menu board_menu ON board_menu.id = rm.menu_id AND board_menu.name = 'board'
         JOIN ums_menu log_menu ON log_menu.name = 'boardLogs'
         LEFT JOIN ums_role r ON r.id = rm.role_id
WHERE @right_db = 1
  AND (r.name IS NULL OR r.name <> '疗愈师')
  AND NOT EXISTS (
    SELECT 1 FROM ums_role_menu_relation x WHERE x.role_id = rm.role_id AND x.menu_id = log_menu.id
);

-- 4) 自检：菜单行 + 授权角色
SELECT id, parent_id, title, level, sort, name, icon, hidden FROM ums_menu WHERE name = 'boardLogs';
SELECT rm.role_id, r.name AS role_name
FROM ums_role_menu_relation rm
         JOIN ums_menu m ON m.id = rm.menu_id AND m.name = 'boardLogs'
         LEFT JOIN ums_role r ON r.id = rm.role_id
ORDER BY rm.role_id;