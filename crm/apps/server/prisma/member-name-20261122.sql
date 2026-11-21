-- Full愈 CRM · 会员昵称统一成「会员+手机号后四位」（存量数据）
--
-- 背景：三个业务端的默认昵称各不相同——时叙/在场落「用户+后四位」，CRM 新建落「会员」，
--       轻疗老数据里还有「茶客」。CRM 是资料主档，三个端展示的是同一个 name，
--       于是小程序个人资料页会出现「用户7229」这种别的端叫法。2026-11-22 业务定稿：
--       默认昵称统一为「会员+手机号后四位」（如 会员7229）。
--
-- 处理：只改占位名（没名字时系统自己起的），客户自取的昵称一条不动：
--          ''、'会员'、'茶客'、'会员XXXX'、'用户XXXX'、'用户+86...'
--       手机号取不到四位（末尾非数字或整串不足 7 位）的保留原 name，交给人工补号。
--       profile_version + 1：推进版本号，各端登录时才会把新 name 拉回本地。
--
-- 幂等：改完的 name 是「会员XXXX」，落在上面的占位名集合里但值不再变化，
--       profile_version 只在 name 真的变了才 +1，可安全重跑。
-- 顺序：本脚本先跑，再跑轻疗侧 sql/2026-11-22-customer-nickname-member-tail.sql。
-- 执行前请先备份 members；回滚见文末注释。
--
-- 用法（库名按环境选）：mysql <库名> < member-name-20261122.sql

-- 0) 留痕备份：只备份将被改写的行，表已存在则复用，不覆盖首次备份
CREATE TABLE IF NOT EXISTS `member_name_bak_20261122` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `profile_version` INT DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '昵称统一成会员+后四位前的原值备份';

INSERT IGNORE INTO `member_name_bak_20261122` (`id`, `name`, `profile_version`)
SELECT `id`, `name`, `profile_version`
FROM `members`
WHERE (
    TRIM(`name`) IN ('', '会员', '茶客')
    OR `name` REGEXP '^会员[0-9]{4}$'
    OR `name` REGEXP '^用户[+]?[0-9]{4,15}$'
  )
  AND `phone` REGEXP '[0-9]{4}$'
  AND CHAR_LENGTH(`phone`) >= 7
  AND `name` <> CONCAT('会员', RIGHT(`phone`, 4));

-- 1) 批量替换占位 name 为「会员+后四位」+ 推进资料版本号
UPDATE `members`
SET `name` = CONCAT('会员', RIGHT(`phone`, 4)),
    `profile_version` = `profile_version` + 1,
    `updated_at` = NOW(3)
WHERE (
    TRIM(`name`) IN ('', '会员', '茶客')
    OR `name` REGEXP '^会员[0-9]{4}$'
    OR `name` REGEXP '^用户[+]?[0-9]{4,15}$'
  )
  AND `phone` REGEXP '[0-9]{4}$'
  AND CHAR_LENGTH(`phone`) >= 7
  AND `name` <> CONCAT('会员', RIGHT(`phone`, 4));

-- 2) 自检：
--    placeholder_left  应该只剩「脏手机号」那几条（生产 2026-11-22 基线：0）
--    member_tail       统一后的默认名条数
--    custom_kept       客户自取昵称，必须与执行前一致
SELECT 'placeholder_left' AS item, COUNT(*) AS cnt
FROM `members`
WHERE TRIM(`name`) IN ('', '会员', '茶客') OR `name` REGEXP '^用户[+]?[0-9]{4,15}$'
UNION ALL
SELECT 'member_tail', COUNT(*)
FROM `members`
WHERE `name` REGEXP '^会员[0-9]{4}$'
UNION ALL
SELECT 'custom_kept', COUNT(*)
FROM `members`
WHERE TRIM(`name`) NOT IN ('', '会员', '茶客')
  AND `name` NOT REGEXP '^会员[0-9]{4}$'
  AND `name` NOT REGEXP '^用户[+]?[0-9]{4,15}$';

-- 回滚（按备份表恢复 name 与 profile_version）
-- UPDATE `members` m
--   JOIN `member_name_bak_20261122` b ON b.`id` = m.`id`
--   SET m.`name` = b.`name`, m.`profile_version` = b.`profile_version`;