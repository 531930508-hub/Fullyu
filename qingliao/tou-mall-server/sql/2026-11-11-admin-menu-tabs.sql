-- 2026-11-11 后台菜单二次归并：一个菜单项 = 一组 tab，侧边栏不再出现三级菜单
-- 目标库：tou_mall_demo；生产库执行前请确认已备份。脚本可重复执行（先清空再写入固定 ID）
-- 一级菜单：首页、待办中心（常驻，不落库）/ 预约与订单 / 客户与营销 / 数据与薪资 / 门店与系统
-- 每组 3-4 项，合并页的 URL 见 web 端 router/index.js 的 ?tab= 约定

-- 1) 备份（首次执行留存，重复执行不覆盖）
CREATE TABLE IF NOT EXISTS ums_menu_bak_20261111 LIKE ums_menu;
INSERT INTO ums_menu_bak_20261111 SELECT m.* FROM ums_menu m WHERE NOT EXISTS (SELECT 1 FROM ums_menu_bak_20261111 b WHERE b.id = m.id);
CREATE TABLE IF NOT EXISTS ums_role_menu_relation_bak_20261111 LIKE ums_role_menu_relation;
INSERT INTO ums_role_menu_relation_bak_20261111 SELECT r.* FROM ums_role_menu_relation r WHERE NOT EXISTS (SELECT 1 FROM ums_role_menu_relation_bak_20261111 b WHERE b.id = r.id);

-- 2) 重建菜单树（id 100-104 为一级分组，11x/12x/13x/14x 为组内入口）
DELETE FROM ums_menu;
INSERT INTO ums_menu (id, parent_id, create_time, title, level, sort, name, icon, hidden) VALUES
  (101, 0, NOW(), '预约与订单', 0, 40, 'booking', 'schedules', 0),
  (102, 0, NOW(), '客户与营销', 0, 30, 'growth', 'customer', 0),
  (103, 0, NOW(), '数据与薪资', 0, 20, 'analysis', 'statistics', 0),
  (104, 0, NOW(), '门店与系统', 0, 10, 'staff', 'ums-role', 0),

  -- 预约与订单：排班看板 / 预约列表 / 排班与请假（疗愈师排班+请假）/ 订单列表（普通+卡券）
  (110, 101, NOW(), '预约列表', 1, 80, 'appointmentList', 'order', 0),
  (111, 101, NOW(), '排班看板', 1, 79, 'board', 'dashboard', 0),
  (112, 101, NOW(), '排班与请假', 1, 78, 'shiftCenter', 'schedules', 0),
  (113, 101, NOW(), '订单列表', 1, 77, 'orderCenter', 'order', 0),
  (114, 101, NOW(), '预约登记', 1, 40, 'appointmentCreate', NULL, 1),
  (115, 101, NOW(), '退款审批', 1, 39, 'approval', NULL, 1),

  -- 客户与营销：客户列表 / 商品列表 / 礼品卡 / 活动与折扣（活动+折扣）
  (120, 102, NOW(), '客户列表', 1, 80, 'customer', 'ums-admin', 0),
  (121, 102, NOW(), '商品列表', 1, 79, 'product', 'product-list', 0),
  (122, 102, NOW(), '礼品卡', 1, 78, 'giftCard', 'room', 0),
  (123, 102, NOW(), '活动与折扣', 1, 77, 'marketingCenter', 'sms-hot', 0),

  -- 数据与薪资：经营数据（流水/时长/疗愈师/月度）/ 薪资明细 / 薪资设置 / 激励中心（看板/培训/参数）
  (130, 103, NOW(), '经营数据', 1, 80, 'statisticsOverview', 'statistics', 0),
  (131, 103, NOW(), '薪资明细', 1, 79, 'salaryDetail', 'salary', 0),
  (132, 103, NOW(), '薪资设置', 1, 78, 'salarySet', 'salarySet', 0),
  (133, 103, NOW(), '激励中心', 1, 77, 'incentiveCenter', 'dashboard', 0),

  -- 门店与系统：门店团队（疗愈师/评价/门店/房间/床位）/ 账号权限（账号/角色/菜单/资源）/ 系统配置（审批/图片）
  (140, 104, NOW(), '门店团队', 1, 80, 'teamCenter', 'massagist', 0),
  (141, 104, NOW(), '账号权限', 1, 79, 'accessCenter', 'ums-admin', 0),
  (142, 104, NOW(), '系统配置', 1, 78, 'systemConfig', 'ums-menu', 0);

-- 3) 按新菜单重建角色授权
--    合并页沿用「原页面之一有权限即放行」的口径：
--    112 排班与请假 ← 原 113 疗愈师排班 / 114 疗愈师请假
--    113 订单列表   ← 原 115 普通订单 / 116 卡券订单
--    123 活动与折扣 ← 原 123 活动列表 / 124 折扣配置
--    130 经营数据   ← 原 130-133 流水/时长/疗愈师/月度
--    133 激励中心   ← 原 136-138 看板/培训/参数
--    140 门店团队   ← 原 140-144 疗愈师/评价/门店/房间/床位
--    141 账号权限   ← 原 145/146/147/150 账号/角色/菜单/资源
--    142 系统配置   ← 原 148/149 审批/图片
DELETE FROM ums_role_menu_relation;
INSERT INTO ums_role_menu_relation (role_id, menu_id) VALUES
  (6, 101),(6, 103),(6, 112),(6, 130),(6, 131),
  (7, 101),(7, 103),(7, 104),(7, 110),(7, 111),(7, 112),(7, 113),(7, 114),(7, 130),(7, 133),(7, 140),
  (8, 101),(8, 102),(8, 103),(8, 104),(8, 110),(8, 111),(8, 112),(8, 113),(8, 115),(8, 120),(8, 121),(8, 130),(8, 131),(8, 140),
  (9, 101),(9, 102),(9, 103),(9, 104),(9, 110),(9, 111),(9, 112),(9, 113),(9, 114),(9, 115),(9, 120),(9, 130),(9, 131),(9, 133),(9, 140),
  (10, 101),(10, 103),(10, 113),(10, 130),(10, 131),(10, 132),(10, 133),
  (11, 101),(11, 102),(11, 103),(11, 104),(11, 110),(11, 111),(11, 112),(11, 113),(11, 114),(11, 115),(11, 120),(11, 130),(11, 131),(11, 133),(11, 140),
  (12, 101),(12, 102),(12, 104),(12, 110),(12, 111),(12, 113),(12, 120),(12, 140);

-- 4) 超级管理员：全量授权
INSERT INTO ums_role_menu_relation (role_id, menu_id) SELECT 5, id FROM ums_menu;

-- 5) 清理已删除角色遗留授权
DELETE FROM ums_role_menu_relation WHERE role_id NOT IN (SELECT id FROM ums_role);

-- 6) 自增位对齐
ALTER TABLE ums_menu AUTO_INCREMENT = 200;