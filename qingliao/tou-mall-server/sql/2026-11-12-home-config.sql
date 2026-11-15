-- Full愈 · 后台首页「角色区块配置」表
-- 适用：MySQL 5.7/8.0，执行前请先备份。
-- 背景：HomeConfigMapper 在登录后即读/写 ums_home_config（/homeConfig/mine），
--       2026-11-11 的生产库盘点发现：代码已上线、表却没有任何迁移脚本创建过
--       （测试库是手工建的），生产补 DDL 时会漏掉这张表 → 管理端首页直接 500。
-- 说明：一个角色一行，config_json 存 {blocks:[],links:[]}；脚本可重复执行。

CREATE TABLE IF NOT EXISTS `ums_home_config` (
  `role_id`     BIGINT   NOT NULL COMMENT '角色ID，一个角色一行',
  `config_json` LONGTEXT NULL COMMENT '首页区块与快捷入口配置 {blocks:[],links:[]}',
  `update_time` DATETIME NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最后保存时间',
  PRIMARY KEY (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='后台首页角色区块配置';