-- 【生产版】由 sql/2026-11-07-admin-todo.sql 自动生成（scripts/make-prod-sql.py）。
-- 改动仅一处：把「仅测试库执行 / 非测试库就报错」的守卫改为无条件执行。
-- 执行前请备份；执行后跑 ./scripts/sql-audit.py 校验结构。
-- 门店待办（后台首页悬浮卡）
-- 2026-11-07
CREATE TABLE IF NOT EXISTS `c_admin_todo` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `shop_id` bigint DEFAULT NULL COMMENT '门店id',
  `content` varchar(500) NOT NULL COMMENT '待办内容',
  `status` tinyint NOT NULL DEFAULT 0 COMMENT '0待完成 1已完成',
  `creator_id` bigint DEFAULT NULL COMMENT '创建人id',
  `creator_name` varchar(64) DEFAULT NULL COMMENT '创建人姓名',
  `complete_id` bigint DEFAULT NULL COMMENT '完成人id',
  `complete_name` varchar(64) DEFAULT NULL COMMENT '完成人姓名',
  `complete_time` datetime DEFAULT NULL COMMENT '完成时间',
  `create_time` datetime DEFAULT NULL,
  `update_time` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_shop_status` (`shop_id`, `status`),
  KEY `idx_shop_create` (`shop_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门店待办';
