-- 【生产版】由 sql/2026-11-28-therapist-board-readonly.sql 自动生成（scripts/make-prod-sql.py）。
-- 改动仅一处：把「仅测试库执行 / 非测试库就报错」的守卫改为无条件执行。
-- 执行前请备份；执行后跑 ./scripts/sql-audit.py 校验结构。
-- 2026-11-28 疗愈师角色开放「排班看板」菜单（只读）
-- 背景：看板对疗愈师原先没有菜单入口；本次允许查看，但页面写入口隐藏、后端写接口按角色拒绝。
-- 只补授权，不删除疗愈师已有菜单；可重复执行。

SET @therapist_role_id = (SELECT id FROM ums_role WHERE name = '疗愈师' LIMIT 1);
SET @board_menu_id = (SELECT id FROM ums_menu WHERE name = 'board' AND parent_id <> 0 LIMIT 1);

INSERT INTO ums_role_menu_relation (role_id, menu_id)
SELECT @therapist_role_id, @board_menu_id
WHERE @therapist_role_id IS NOT NULL
  AND @board_menu_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM ums_role_menu_relation
    WHERE role_id = @therapist_role_id AND menu_id = @board_menu_id
  );

-- 自检：应返回疗愈师角色与排班看板菜单的绑定关系
SELECT r.id AS role_id, r.name AS role_name, m.id AS menu_id, m.title AS menu_title
FROM ums_role r
JOIN ums_role_menu_relation rm ON rm.role_id = r.id
JOIN ums_menu m ON m.id = rm.menu_id
WHERE r.name = '疗愈师' AND m.name = 'board';