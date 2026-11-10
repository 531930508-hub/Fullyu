-- 门店店长审批规则
-- 背景：审批设置去掉「门店参数」后，请假仍需要各门店店长审批。
-- 本表为每个门店配置一位店长（疗愈师），请假等门店审批优先路由到该店店长。
-- 店长离职时必须选择同店在职接班人，并同步更新本表（见 MassagistService.saveOrUpd）。
CREATE TABLE IF NOT EXISTS `f_approval_shop_manager` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `shop_id` bigint NOT NULL COMMENT '门店id',
  `massagist_id` bigint NOT NULL COMMENT '店长疗愈师id',
  `ums_admin_id` bigint NOT NULL COMMENT '店长后台账号id（审批人）',
  `create_user` bigint DEFAULT NULL COMMENT '配置人后台账号id',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_shop_id` (`shop_id`),
  UNIQUE KEY `uk_massagist_id` (`massagist_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门店店长审批规则';
