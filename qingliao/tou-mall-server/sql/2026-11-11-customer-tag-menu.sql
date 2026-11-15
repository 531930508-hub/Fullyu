-- 2026-11-11 客户与营销：新增「标签管理」二级菜单
-- 背景：基础标签原先只藏在客户列表/商品列表/活动列表的抽屉里，维护入口分散且无法直达
-- 处理：新建 /crm/tag 独立页面（组件名 customerTag），挂在「客户与营销」下、客户列表之后
-- 授权：沿用「能看客户列表就能维护标签」的口径，按 ums_role_menu_relation 里已有 客户列表(customer) 的角色复制
-- 脚本可重复执行；生产库执行前请先备份 ums_menu / ums_role_menu_relation

-- 1) 父级取「客户列表」所在的一级菜单，避免写死 ID
SET @parent_id = (SELECT parent_id FROM ums_menu WHERE name = 'customer' LIMIT 1);

-- 2) 排序：侧栏按 sort 倒序展示（客户列表 80 → 商品列表 79 → …）。
--    要让「标签管理」紧跟客户列表，固定取 sort=79，并把同组 sort<=79 的兄弟菜单整体 -1 腾位。
--    仅在首次执行时调整，保证脚本可重复执行。
SET @has_tag = (SELECT COUNT(*) FROM ums_menu WHERE name = 'customerTag');

UPDATE ums_menu
SET sort = sort - 1
WHERE parent_id = @parent_id
  AND sort <= 79
  AND sort > 0
  AND @has_tag = 0;

-- 3) 新建菜单行（sort 79：客户列表之后、原商品列表之前）
INSERT INTO ums_menu (parent_id, create_time, title, level, sort, name, icon, hidden)
SELECT @parent_id, NOW(), '标签管理', 1, 79, 'customerTag', 'nav-category', 0
FROM DUAL
WHERE @parent_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ums_menu WHERE name = 'customerTag');

-- 4) 复制授权：凡是已有「客户列表」的角色，一并授予「标签管理」
INSERT INTO ums_role_menu_relation (role_id, menu_id)
SELECT DISTINCT rm.role_id, tag_menu.id
FROM ums_role_menu_relation rm
         JOIN ums_menu customer_menu ON customer_menu.id = rm.menu_id AND customer_menu.name = 'customer'
         JOIN ums_menu tag_menu ON tag_menu.name = 'customerTag'
WHERE NOT EXISTS (
    SELECT 1
    FROM ums_role_menu_relation x
    WHERE x.role_id = rm.role_id
      AND x.menu_id = tag_menu.id
);

-- 5) 自检：应返回 1 行菜单 + 每个可见客户列表的角色 1 行授权
SELECT id, parent_id, title, level, sort, name, icon, hidden FROM ums_menu WHERE name = 'customerTag';
SELECT rm.role_id, r.name AS role_name
FROM ums_role_menu_relation rm
         JOIN ums_menu m ON m.id = rm.menu_id AND m.name = 'customerTag'
         LEFT JOIN ums_role r ON r.id = rm.role_id;