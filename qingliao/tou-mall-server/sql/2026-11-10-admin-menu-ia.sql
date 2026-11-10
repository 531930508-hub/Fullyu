-- 2026-11-10 后台菜单信息架构归并（6 个一级菜单）+ 术语统一为「疗愈师」
-- 目标库：tou_mall_demo；生产库执行前请确认已备份。脚本可重复执行（先清空再写入固定 ID）
-- 一级菜单：首页、待办中心（常驻，不落库）/ 预约与订单 / 客户与营销 / 数据与薪资 / 门店与系统

-- 1) 备份原菜单与授权（首次执行留存，重复执行不覆盖）
CREATE TABLE IF NOT EXISTS ums_menu_bak_20261110 LIKE ums_menu;
INSERT INTO ums_menu_bak_20261110 SELECT m.* FROM ums_menu m WHERE NOT EXISTS (SELECT 1 FROM ums_menu_bak_20261110 b WHERE b.id = m.id);
CREATE TABLE IF NOT EXISTS ums_role_menu_relation_bak_20261110 LIKE ums_role_menu_relation;
INSERT INTO ums_role_menu_relation_bak_20261110 SELECT r.* FROM ums_role_menu_relation r WHERE NOT EXISTS (SELECT 1 FROM ums_role_menu_relation_bak_20261110 b WHERE b.id = r.id);

-- 2) 重建菜单树
DELETE FROM ums_menu;
INSERT INTO ums_menu (id, parent_id, create_time, title, level, sort, name, icon, hidden) VALUES
  (101, 0, NOW(), '预约与订单', 0, 40, 'booking', 'schedules', 0),
  (102, 0, NOW(), '客户与营销', 0, 30, 'growth', 'customer', 0),
  (103, 0, NOW(), '数据与薪资', 0, 20, 'analysis', 'statistics', 0),
  (104, 0, NOW(), '门店与系统', 0, 10, 'staff', 'ums-role', 0),
  (110, 101, NOW(), '预约列表', 1, 80, 'appointmentList', 'order', 0),
  (111, 101, NOW(), '预约登记', 1, 79, 'appointmentCreate', 'schedules', 0),
  (112, 101, NOW(), '排班看板', 1, 78, 'board', 'dashboard', 0),
  (113, 101, NOW(), '疗愈师排班', 1, 77, 'schedules', 'schedules', 0),
  (114, 101, NOW(), '疗愈师请假', 1, 76, 'leave', 'leave', 0),
  (115, 101, NOW(), '普通订单', 1, 70, 'ordinary', 'order', 0),
  (116, 101, NOW(), '卡券订单', 1, 69, 'coupons', 'coupons', 0),
  (117, 101, NOW(), '退款审批', 1, 60, 'approval', NULL, 1),
  (120, 102, NOW(), '客户列表', 1, 80, 'customer', 'ums-admin', 0),
  (121, 102, NOW(), '商品列表', 1, 70, 'product', 'product-list', 0),
  (122, 102, NOW(), '礼品卡', 1, 60, 'giftCard', 'room', 0),
  (123, 102, NOW(), '活动列表', 1, 50, 'activity', 'sms-hot', 0),
  (124, 102, NOW(), '折扣配置', 1, 45, 'discount', 'sms-hot', 0),
  (125, 102, NOW(), '券包与优惠', 1, 40, 'coupon', 'sms-coupon', 0),
  (130, 103, NOW(), '经营流水', 1, 80, 'revenue', 'room', 0),
  (131, 103, NOW(), '服务时长', 1, 79, 'serviceDuration', 'bed', 0),
  (132, 103, NOW(), '疗愈师统计', 1, 78, 'therapistStats', 'bed', 0),
  (133, 103, NOW(), '月度统计', 1, 77, 'monthly', 'monthly', 0),
  (134, 103, NOW(), '薪资明细', 1, 70, 'salaryDetail', 'salary', 0),
  (135, 103, NOW(), '薪资设置', 1, 69, 'salarySet', 'salary', 0),
  (136, 103, NOW(), '激励看板', 1, 68, 'incentiveBoard', 'dashboard', 0),
  (137, 103, NOW(), '培训考核', 1, 67, 'incentiveTraining', 'comment', 0),
  (138, 103, NOW(), '奖励参数', 1, 66, 'incentiveSettings', 'salarySet', 0),
  (140, 104, NOW(), '疗愈师管理', 1, 80, 'management', 'massagist', 0),
  (141, 104, NOW(), '疗愈师评价', 1, 79, 'comment', 'comment', 0),
  (142, 104, NOW(), '门店列表', 1, 78, 'shopList', 'shopList', 0),
  (143, 104, NOW(), '房间管理', 1, 77, 'room', 'room', 0),
  (144, 104, NOW(), '床位管理', 1, 76, 'bed', 'bed', 0),
  (145, 104, NOW(), '账号列表', 1, 70, 'admin', 'ums-admin', 0),
  (146, 104, NOW(), '角色权限', 1, 69, 'role', 'ums-role', 0),
  (147, 104, NOW(), '菜单管理', 1, 60, 'menu', 'ums-menu', 0),
  (148, 104, NOW(), '审批设置', 1, 59, 'approvalCategory', 'approvalCategory', 0),
  (149, 104, NOW(), '图片管理', 1, 58, 'miniImage', 'miniImage', 0),
  (150, 104, NOW(), '资源列表', 1, 57, 'resource', 'ums-resource', 0);

-- 3) 按新菜单重建角色授权：保留各角色原有可见页面范围，丢弃已下线菜单（会员卡/积分/整合运营等）
DELETE FROM ums_role_menu_relation;
INSERT INTO ums_role_menu_relation (role_id, menu_id) VALUES (6, 101),(6, 103),(6, 114),(6, 131),(6, 132),(6, 134);
INSERT INTO ums_role_menu_relation (role_id, menu_id) VALUES (7, 101),(7, 103),(7, 104),(7, 110),(7, 111),(7, 112),(7, 113),(7, 115),(7, 116),(7, 132),(7, 136),(7, 137),(7, 138),(7, 140),(7, 142),(7, 144);
INSERT INTO ums_role_menu_relation (role_id, menu_id) VALUES (8, 101),(8, 102),(8, 103),(8, 104),(8, 110),(8, 112),(8, 113),(8, 115),(8, 116),(8, 117),(8, 120),(8, 121),(8, 130),(8, 131),(8, 132),(8, 134),(8, 140),(8, 142),(8, 144);
INSERT INTO ums_role_menu_relation (role_id, menu_id) VALUES (9, 101),(9, 102),(9, 103),(9, 104),(9, 110),(9, 111),(9, 112),(9, 113),(9, 114),(9, 115),(9, 116),(9, 117),(9, 120),(9, 130),(9, 131),(9, 132),(9, 134),(9, 136),(9, 137),(9, 138),(9, 140),(9, 141),(9, 142),(9, 143),(9, 144);
INSERT INTO ums_role_menu_relation (role_id, menu_id) VALUES (10, 101),(10, 103),(10, 115),(10, 116),(10, 130),(10, 131),(10, 132),(10, 133),(10, 134),(10, 135),(10, 136),(10, 137),(10, 138);
INSERT INTO ums_role_menu_relation (role_id, menu_id) VALUES (11, 101),(11, 102),(11, 103),(11, 104),(11, 110),(11, 111),(11, 112),(11, 113),(11, 114),(11, 115),(11, 116),(11, 117),(11, 120),(11, 130),(11, 131),(11, 132),(11, 134),(11, 136),(11, 137),(11, 138),(11, 140),(11, 141);
INSERT INTO ums_role_menu_relation (role_id, menu_id) VALUES (12, 101),(12, 102),(12, 104),(12, 110),(12, 112),(12, 115),(12, 120),(12, 140),(12, 141);

-- 4) 超级管理员：全量授权
INSERT INTO ums_role_menu_relation (role_id, menu_id) SELECT 5, id FROM ums_menu;

-- 5) 清理已删除角色（1、2）遗留授权
DELETE FROM ums_role_menu_relation WHERE role_id NOT IN (SELECT id FROM ums_role);

-- 6) 自增位对齐
ALTER TABLE ums_menu AUTO_INCREMENT = 200;
