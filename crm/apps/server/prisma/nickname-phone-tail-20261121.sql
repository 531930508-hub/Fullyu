-- Full愈 CRM · 会员 name 改回「用户+手机号后四位」（存量数据）
--
-- 背景：轻疗把默认昵称从「中文词+4位数字」改回「用户+后四位」，CRM 的 members.name
--       与轻疗昵称是同一字段（见 BrandMemberProfileSync / brand-member.service.ts）。
--       CRM 是资料主档，轻疗登录时以 CRM 为准，所以必须同步改，否则客户一登录就被改回去。
--
-- 处理：只改系统默认样式（两位中文 + 四位数字）的 name；客户自取的昵称一条不动。
--       脏手机号跳过、保留原 name：末尾不足四位数字，或整串不足 7 位（截断后的残号）。
--       profile_version + 1：推进版本号，轻疗登录时才会把新 name 拉回本地。
--
-- 幂等：改完的 name 是「用户XXXX」，被 NOT LIKE '用户%' 排除，可安全重跑。
-- 顺序：本脚本先跑，再跑轻疗侧 sql/2026-11-21-customer-nickname-phone-tail.sql。
-- 执行前请先备份 members；回滚见文末注释。
--
-- 用法（库名按环境选）：mysql <库名> < nickname-phone-tail-20261121.sql

-- 0) 留痕备份
CREATE TABLE IF NOT EXISTS `member_name_bak_20261121` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `profile_version` INT DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '昵称改回用户+后四位前的原值备份';

INSERT IGNORE INTO `member_name_bak_20261121` (`id`, `name`, `profile_version`)
SELECT `id`, `name`, `profile_version`
FROM `members`
WHERE `name` COLLATE utf8mb4_unicode_ci REGEXP '^[一-龥]{2}[0-9]{4}$'
  AND `name` NOT LIKE '用户%';

-- 1) 批量替换默认 name + 推进资料版本号
UPDATE `members`
SET `name` = CONCAT('用户', RIGHT(`phone`, 4)),
    `profile_version` = `profile_version` + 1,
    `updated_at` = NOW(3)
WHERE `name` COLLATE utf8mb4_unicode_ci REGEXP '^[一-龥]{2}[0-9]{4}$'
  AND `name` NOT LIKE '用户%'
  AND `phone` COLLATE utf8mb4_unicode_ci REGEXP '[0-9]{4}$'
  AND CHAR_LENGTH(`phone`) >= 7;

-- 2) 自检
--    生产实测：10,096 位随机样式 → 10,085 位「用户XXXX」；剩 11 位脏手机号保留原 name。
--    still_random 应等于脏手机号条数（生产 11），custom_kept 应为客户自取 name 数（生产 57）。
SELECT 'still_random' AS item, COUNT(*) AS cnt
FROM `members`
WHERE `name` COLLATE utf8mb4_unicode_ci REGEXP '^[一-龥]{2}[0-9]{4}$' AND `name` NOT LIKE '用户%'
UNION ALL
SELECT 'user_tail', COUNT(*)
FROM `members`
WHERE `name` REGEXP '^用户[0-9]{4}$'
UNION ALL
SELECT 'custom_kept', COUNT(*)
FROM `members`
WHERE `name` COLLATE utf8mb4_unicode_ci NOT REGEXP '^[一-龥]{2}[0-9]{4}$' AND `name` NOT LIKE '用户%';

-- 回滚（按备份表恢复 name 与 profile_version）
-- UPDATE `members` m
--   JOIN `member_name_bak_20261121` b ON b.`id` = m.`id`
--   SET m.`name` = b.`name`, m.`profile_version` = b.`profile_version`;