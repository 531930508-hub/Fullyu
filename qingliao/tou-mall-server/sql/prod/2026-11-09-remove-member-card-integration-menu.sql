-- 【生产版】由 sql/2026-11-09-remove-member-card-integration-menu.sql 自动生成（scripts/make-prod-sql.py）。
-- 改动仅一处：把「仅测试库执行 / 非测试库就报错」的守卫改为无条件执行。
-- 执行前请备份；执行后跑 ./scripts/sql-audit.py 校验结构。
-- 会员卡与积分管理统一由 CRM 承担，轻疗后台不再保留这两个入口。
-- 仅删除菜单与角色关联，不删除客户积分/会员卡业务数据，也不影响后端接口。
-- 会员卡支付、退款执行与积分同步仍由轻疗后端完成（CRM 调用）。
DELETE FROM `ums_role_menu_relation`
WHERE menu_id IN (
  SELECT id FROM (
    SELECT id FROM `ums_menu` WHERE name IN ('memberCard', 'integration')
  ) t
);

DELETE FROM `ums_menu` WHERE name IN ('memberCard', 'integration');
