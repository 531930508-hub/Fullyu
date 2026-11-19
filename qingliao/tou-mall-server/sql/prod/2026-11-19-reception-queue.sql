-- 【生产版】由 sql/2026-11-19-reception-queue.sql 自动生成（scripts/make-prod-sql.py）。
-- 改动仅一处：把「仅测试库执行 / 非测试库就报错」的守卫改为无条件执行。
-- 执行前请备份；执行后跑 ./scripts/sql-audit.py 校验结构。
-- 2026-12-08 轮牌（接待排队）底层重建：队列 + 流水 + 事项 + 参数
-- 背景：现有 s_round_schedule 把「排序」和「预约行」揉在一起，靠 `currentRound+1` 整轮重建排班。
--       一旦有人取消/被跳过就会删行重建，结果就是 7 号排在 3 号前面、一键安排排到没值班的人。
-- 做法：把「谁排在谁前面」抽成 s_reception_queue（当天每店每人一行，seq 只增不减），
--       s_round_schedule 退化成「预约行/已排次数」的记录表，排序一律按队列投影。
-- 口径：
--   1. seq 越大越靠后；上钟 → seq = max+1；撤销 → 回填上钟前的 seq（只回不做其它变更）。
--   2. on_duty 只管值班状态，不动 seq：点值班只是从「休息区」回到「值班区」，位置永远是队列里的位置。
--   3. 排序展示口径 = on_duty desc, seq asc：值班的在前，休息的垫后，人数不够时自动往休息区取。
--   4. receipt_no 是给人看的结果编号，按 seq 顺序编 1..n；全员各轮一遍后重排，未轮完一路往后延。
-- 可重复执行：全部 CREATE TABLE IF NOT EXISTS，无数据变更，历史 s_round_schedule 不动（当天队列首次使用时按班次顺序惰性生成）。

-- 1. 轮牌队列：当天每店每人一行，顺序的唯一真相
CREATE TABLE IF NOT EXISTS `s_reception_queue` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `queue_date` date NOT NULL COMMENT '轮牌日期',
  `shop_id` bigint NOT NULL COMMENT '门店id',
  `massagist_id` bigint NOT NULL COMMENT '疗愈师id',
  `seq` bigint NOT NULL COMMENT '排序键，越小越靠前；上钟取 max+1，撤销回填上钟前的值',
  `receipt_no` int NOT NULL DEFAULT 0 COMMENT '结果编号（1..n，展示用，不参与排序）',
  `on_duty` tinyint NOT NULL DEFAULT 0 COMMENT '值班状态 1值班 0休息/未值班',
  `valid` tinyint NOT NULL DEFAULT 1 COMMENT '1在轮牌中 0已退出（请假/调走/离职）',
  `source` tinyint NOT NULL DEFAULT 0 COMMENT '0初始 1补位 2调店 3手动',
  `assign_count` int NOT NULL DEFAULT 0 COMMENT '当天上钟次数',
  `last_assign_time` datetime DEFAULT NULL COMMENT '最近一次上钟时间',
  `create_time` datetime DEFAULT NULL,
  `update_time` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_date_shop_massagist` (`queue_date`,`shop_id`,`massagist_id`),
  KEY `idx_date_shop_seq` (`queue_date`,`shop_id`,`seq`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='轮牌队列（当日顺序）';

-- 2. 队列流水：谁在什么时候因为什么换了位置，事后可追
CREATE TABLE IF NOT EXISTS `s_reception_queue_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `queue_date` date NOT NULL COMMENT '轮牌日期',
  `shop_id` bigint NOT NULL COMMENT '门店id',
  `massagist_id` bigint NOT NULL COMMENT '疗愈师id',
  `action` varchar(16) NOT NULL COMMENT 'INIT初始化 ADD补位 JOIN调店进店 LEAVE退出 ON_DUTY值班 OFF_DUTY下值班 ASSIGN上钟 REVERT撤销回位 FINISH接待完成 GRAB抢单 RENO重排编号',
  `detail_id` bigint DEFAULT NULL COMMENT '关联订单详情id',
  `before_seq` bigint DEFAULT NULL COMMENT '变更前seq',
  `after_seq` bigint DEFAULT NULL COMMENT '变更后seq',
  `before_on_duty` tinyint DEFAULT NULL COMMENT '变更前值班状态',
  `after_on_duty` tinyint DEFAULT NULL COMMENT '变更后值班状态',
  `before_receipt_no` int DEFAULT NULL COMMENT '变更前结果编号',
  `after_receipt_no` int DEFAULT NULL COMMENT '变更后结果编号',
  `reason` varchar(255) DEFAULT NULL COMMENT '原因/备注',
  `operator_name` varchar(64) DEFAULT NULL COMMENT '操作人',
  `create_time` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_date_shop_massagist` (`queue_date`,`shop_id`,`massagist_id`),
  KEY `idx_date_shop_detail` (`queue_date`,`shop_id`,`detail_id`,`action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='轮牌队列流水';

-- 3. 事项表：需要人处理、有生命周期的轮牌问题（值班意向、无值班可接待、超时未接待）
CREATE TABLE IF NOT EXISTS `s_reception_issue` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `issue_date` date NOT NULL COMMENT '业务日期',
  `shop_id` bigint NOT NULL COMMENT '门店id',
  `massagist_id` bigint DEFAULT NULL COMMENT '疗愈师id（无值班可接待时为空）',
  `type` tinyint NOT NULL COMMENT '1值班意向(抢单资格) 2无值班可接待(自动启用休息区) 3超时未接待(可抢单) 4轮牌异常',
  `status` tinyint NOT NULL DEFAULT 0 COMMENT '0待处理 1已处理 2已过期 3已取消',
  `detail_id` bigint DEFAULT NULL COMMENT '关联订单详情id',
  `deadline` datetime DEFAULT NULL COMMENT '截止时间，过期不可再抢',
  `handled_time` datetime DEFAULT NULL COMMENT '处理时间',
  `handler_name` varchar(64) DEFAULT NULL COMMENT '处理人',
  `remark` varchar(500) DEFAULT NULL COMMENT '说明',
  `create_time` datetime DEFAULT NULL,
  `update_time` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_date_shop_type_status` (`issue_date`,`shop_id`,`type`,`status`),
  KEY `idx_massagist` (`massagist_id`),
  KEY `idx_detail` (`detail_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='轮牌事项（值班意向/抢单/异常）';

-- 4. 参数：留给门店调，代码里有默认值
CREATE TABLE IF NOT EXISTS `s_reception_config` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `shop_id` bigint NOT NULL DEFAULT 0 COMMENT '门店id，0为全局默认',
  `grab_window_minutes` int NOT NULL DEFAULT 7 COMMENT '点值班后/上钟后多少分钟内可抢单',
  `duty_switch` tinyint NOT NULL DEFAULT 1 COMMENT '1开启值班/休息区分 0所有人同一队列',
  `create_time` datetime DEFAULT NULL,
  `update_time` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_shop` (`shop_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='轮牌参数';

INSERT INTO `s_reception_config` (`shop_id`, `grab_window_minutes`, `duty_switch`, `create_time`, `update_time`)
SELECT 0, 7, 1, NOW(), NOW() FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `s_reception_config` WHERE `shop_id` = 0);
