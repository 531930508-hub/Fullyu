-- Full愈 在场 · 会员默认昵称改回「用户+手机号后四位」（存量数据）
--
-- 背景：2026-11-12 为「去手机号化」把默认昵称改成「中文词+4位数字」，教练/店长在会员列表、
--       预约、排班里认不出是谁。2026-11-21 业务确认改回「用户+后四位」，与轻疗
--       （sql/2026-11-21-customer-nickname-phone-tail.sql）、CRM（nickname-phone-tail-20261121.sql）
--       同一口径。在场昵称会出现在社区帖子/排班里，后四位外露是业务确认过的取舍。
--
-- 处理：只替换系统默认样式（两位中文 + 四位数字），客户自取的昵称一条不动。
--       已有的「用户XXXX」不动；脏手机号（末尾不足四位数字、或整串不足 7 位）跳过。
-- 幂等：改完的昵称是「用户XXXX」，被 NOT LIKE '用户%' 排除，可安全重跑。
--
-- 用法（库名按环境选）：mysql <库名> < apps/server/prisma/nickname-phone-tail.sql

CREATE TABLE IF NOT EXISTS `users_nickname_bak_20261121` (
  `id` VARCHAR(191) NOT NULL,
  `nickname` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '昵称改回用户+后四位前的原值备份';

INSERT IGNORE INTO `users_nickname_bak_20261121` (`id`, `nickname`)
SELECT `id`, `nickname`
FROM `users`
WHERE `nickname` REGEXP '^[一-龥]{2}[0-9]{4}$'
  AND `nickname` NOT LIKE '用户%';

UPDATE `users`
SET `nickname` = CONCAT('用户', RIGHT(`phone`, 4)),
    `updated_at` = NOW(3)
WHERE `nickname` REGEXP '^[一-龥]{2}[0-9]{4}$'
  AND `nickname` NOT LIKE '用户%'
  AND `phone` REGEXP '[0-9]{4}$'
  AND CHAR_LENGTH(`phone`) >= 7;

-- 自检：生产实测 5 位随机样式 → 用户XXXX（另有 2 位已是用户样式、3 位客户自取，均未动）
SELECT 'still_random' AS item, COUNT(*) AS cnt
FROM `users`
WHERE `nickname` REGEXP '^[一-龥]{2}[0-9]{4}$' AND `nickname` NOT LIKE '用户%'
UNION ALL
SELECT 'user_tail', COUNT(*)
FROM `users`
WHERE `nickname` REGEXP '^用户[0-9]{4}$'
UNION ALL
SELECT 'custom_kept', COUNT(*)
FROM `users`
WHERE `nickname` NOT REGEXP '^[一-龥]{2}[0-9]{4}$' AND `nickname` NOT LIKE '用户%';

-- 回滚（按备份表恢复，只影响本次被改写的行）
-- UPDATE `users` u
--   JOIN `users_nickname_bak_20261121` b ON b.`id` = u.`id`
--   SET u.`nickname` = b.`nickname`;