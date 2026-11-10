-- Full愈：「统计 > 疗愈师统计」菜单（订单数/支付方式/男女顾客/点钟/新增点钟/部位 + 导出）。
-- 仅隔离测试库执行；生产尚未授权。不使用 mysql --force；均校验数据库名。
-- 角色与「服务时长」一致（1,5,6,8,9,10,11）；疗愈师(6)后端强制只看本人。
SET @ddl = IF(DATABASE()='tou_mall_test',
  'INSERT INTO `ums_menu` (`parent_id`, `create_time`, `title`, `level`, `sort`, `name`, `icon`, `hidden`)
   SELECT 29, NOW(), ''疗愈师统计'', 1, 1, ''therapistStats'', ''bed'', 0 FROM DUAL
   WHERE NOT EXISTS (SELECT 1 FROM `ums_menu` WHERE `name` = ''therapistStats'' AND `parent_id` = 29)',
  'SELECT * FROM fullyu_therapist_stats_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(DATABASE()='tou_mall_test',
  'INSERT INTO `ums_role_menu_relation` (`role_id`, `menu_id`)
   SELECT r.id, m.id FROM `ums_role` r
   JOIN `ums_menu` m ON m.`name` = ''therapistStats'' AND m.`parent_id` = 29
   WHERE r.id IN (1, 5, 6, 8, 9, 10, 11)
     AND NOT EXISTS (SELECT 1 FROM `ums_role_menu_relation` x WHERE x.`role_id` = r.id AND x.`menu_id` = m.id)',
  'SELECT * FROM fullyu_therapist_stats_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
