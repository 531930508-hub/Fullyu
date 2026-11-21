-- Full愈 · 客户默认昵称统一成「会员+手机号后四位」（轻疗侧存量数据）
--
-- 背景：2026-11-21 三端默认昵称各自为政——轻疗「用户+后四位」、CRM「会员」、
--       老数据「茶客」。CRM 是会员资料主档，客户登录时轻疗用 CRM 的昵称覆盖本地，
--       同一个人在小程序、门店后台、CRM 里看到的是三个名字。2026-11-22 业务定稿：
--       默认昵称统一「会员+手机号后四位」（如 会员7229）。
--
-- 只改占位名（没名字时系统自己起的），客户自己改过的昵称一条不动：
--   ''、'会员'、'茶客'、'会员XXXX'、'用户XXXX'、'用户+86...'
-- 脏手机号跳过、保留原昵称：末尾不足四位数字，或整串不足 7 位（截断后的残号）。
--
-- 与 CRM 的关系：CRM 侧脚本 crm/apps/server/prisma/member-name-20261122.sql
--   必须**先**执行，本脚本后执行；否则客户一登录又被 CRM 的旧昵称改回去。
--
-- 幂等：改完的昵称是「会员XXXX」，值不再变化，可安全重跑。
-- 执行前请先备份 c_customer；回滚见文末注释。

-- 0) 留痕备份：只备份将被改写的行，表已存在则复用，不覆盖首次备份
CREATE TABLE IF NOT EXISTS `c_customer_nickname_bak_20261122` (
  `id` BIGINT NOT NULL,
  `nickname` VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '昵称统一成会员+后四位前的原值备份';

INSERT IGNORE INTO `c_customer_nickname_bak_20261122` (`id`, `nickname`)
SELECT `id`, `nickname`
FROM `c_customer`
WHERE (
    `nickname` IS NULL
    OR TRIM(`nickname`) IN ('', '会员', '茶客')
    OR `nickname` REGEXP '^会员[0-9]{4}$'
    OR `nickname` REGEXP '^用户[+]?[0-9]{4,15}$'
  )
  AND `phone` REGEXP '[0-9]{4}$'
  AND CHAR_LENGTH(`phone`) >= 7
  AND `nickname` <> CONCAT('会员', RIGHT(`phone`, 4));

-- 1) 批量替换默认昵称
UPDATE `c_customer`
SET `nickname` = CONCAT('会员', RIGHT(`phone`, 4))
WHERE (
    `nickname` IS NULL
    OR TRIM(`nickname`) IN ('', '会员', '茶客')
    OR `nickname` REGEXP '^会员[0-9]{4}$'
    OR `nickname` REGEXP '^用户[+]?[0-9]{4,15}$'
  )
  AND `phone` REGEXP '[0-9]{4}$'
  AND CHAR_LENGTH(`phone`) >= 7
  AND `nickname` <> CONCAT('会员', RIGHT(`phone`, 4));

-- 2) 自检：
--    placeholder_left 应只剩脏手机号条数（生产 2026-11-22 基线：13）
--    member_tail      统一后的默认昵称条数
--    custom_kept      客户自取昵称，执行前后必须一致（生产 2026-11-22 基线：55）
SELECT 'placeholder_left' AS item, COUNT(*) AS cnt
FROM `c_customer`
WHERE `nickname` IS NULL
   OR TRIM(`nickname`) IN ('', '会员', '茶客')
   OR `nickname` REGEXP '^用户[+]?[0-9]{4,15}$'
UNION ALL
SELECT 'member_tail', COUNT(*)
FROM `c_customer`
WHERE `nickname` REGEXP '^会员[0-9]{4}$'
UNION ALL
SELECT 'custom_kept', COUNT(*)
FROM `c_customer`
WHERE `nickname` IS NOT NULL
  AND TRIM(`nickname`) NOT IN ('', '会员', '茶客')
  AND `nickname` NOT REGEXP '^会员[0-9]{4}$'
  AND `nickname` NOT REGEXP '^用户[+]?[0-9]{4,15}$';

-- 回滚（按备份表恢复，只影响本次被改写的行）
-- UPDATE `c_customer` c
--   JOIN `c_customer_nickname_bak_20261122` b ON b.`id` = c.`id`
--   SET c.`nickname` = b.`nickname`;