-- Full愈 · 客户级疗愈师偏好「暂别」
-- 适用：MySQL 5.7/8.0，执行前请先备份。
-- 说明：
--   1. 只新增表，不改写现有业务数据；收藏仍复用 c_customer_massagist_relation。
--   2. 对外统一文案为「收藏 / 暂别」，本表与技术字段使用 block 语义，不出现于任何界面。
--   3. 同一客户与同一疗愈师唯一；重复设置按幂等处理。
--   4. 暂别与收藏互斥：服务端设置暂别时同步删除收藏，设置收藏时同步删除暂别。

CREATE TABLE IF NOT EXISTS `c_customer_massagist_block` (
  `id`          BIGINT       NOT NULL AUTO_INCREMENT,
  `customer_id` BIGINT       NOT NULL COMMENT '客户id c_customer.id',
  `massagist_id` BIGINT      NOT NULL COMMENT '疗愈师id s_massagist.id',
  `source`      TINYINT      NOT NULL DEFAULT 1 COMMENT '来源 1=客户本人 2=门店后台代设',
  `create_by`   VARCHAR(64)  DEFAULT NULL COMMENT '操作人：后台为管理员账号；客户本人为空',
  `create_time` DATETIME     DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_customer_massagist` (`customer_id`, `massagist_id`),
  KEY `idx_massagist_id` (`massagist_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='客户暂别的疗愈师（客户级偏好标记，对外统一称「暂别」）';

-- ---------------------------------------------------------------------------
-- 可选：后台代客户收藏留痕（仅在需要记录收藏来源时执行）
-- MySQL 5.7 不支持 ADD COLUMN IF NOT EXISTS，执行前请确认列不存在。
-- ---------------------------------------------------------------------------
-- ALTER TABLE `c_customer_massagist_relation`
--   ADD COLUMN `source` TINYINT NOT NULL DEFAULT 1 COMMENT '来源 1=客户本人 2=门店后台代设',
--   ADD COLUMN `create_by` VARCHAR(64) DEFAULT NULL COMMENT '后台代设操作人';
