-- 【生产版】由 sql/2026-11-21-customer-nickname-phone-tail.sql 自动生成（scripts/make-prod-sql.py）。
-- 改动仅一处：把「仅测试库执行 / 非测试库就报错」的守卫改为无条件执行。
-- 执行前请备份；执行后跑 ./scripts/sql-audit.py 校验结构。
-- Full愈 · 客户默认昵称改回「用户+手机号后四位」（轻疗侧存量数据）
--
-- 背景：2026-11-12 为「去手机号化」把默认昵称改成「中文词+4位数字」（如 青竹4821），
--       店员反馈随机词看不出是谁。2026-11-21 业务确认改回「用户+后四位」（如 用户7229）。
--
-- 取舍（业务已确认）：
--   - 后四位属于可识别信息，是「店员认人」与「号码不完整外露」之间的有意折中；
--   - 昵称不保证唯一：后四位只有 1 万种，一万多位客户必然重名（迁移后实测 2,665 组、
--     约 4 千位客户与别人同名，最热的「用户1888」10 人），检索仍以手机号为准。
--
-- 与 CRM 的关系：CRM 是会员资料主档，客户登录时轻疗会用 CRM 的昵称覆盖本地。
--   所以本脚本必须和 CRM 侧脚本（crm/apps/server/prisma/nickname-phone-tail-20261121.sql）
--   一起执行，顺序：先 CRM，后本脚本。只跑一边会被登录同步改回去。
--
-- 只替换系统默认样式（两位中文 + 四位数字），客户自己改过的昵称一条不动。
-- 脏手机号跳过、保留原昵称：末尾不足四位数字（「朱」「11」「852」），
-- 或整串不足 7 位（「7702」「0000」「11111」，截断后的残号，算出来的「用户0000」没有意义）。
--
-- 幂等：改完的昵称是「用户XXXX」，被 NOT LIKE '用户%' 排除，可安全重跑。
-- 执行前请先备份 c_customer；回滚见文末注释。

-- 0) 留痕备份：只备份将被改写的行，表已存在则复用，不覆盖首次备份
CREATE TABLE IF NOT EXISTS `c_customer_nickname_bak_20261121` (
  `id` BIGINT NOT NULL,
  `nickname` VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '昵称改回用户+后四位前的原值备份';

INSERT IGNORE INTO `c_customer_nickname_bak_20261121` (`id`, `nickname`)
SELECT `id`, `nickname`
FROM `c_customer`
WHERE `nickname` REGEXP '^[一-龥]{2}[0-9]{4}$'
  AND `nickname` NOT LIKE '用户%';

-- 1) 批量替换默认昵称
UPDATE `c_customer`
SET `nickname` = CONCAT('用户', RIGHT(`phone`, 4))
WHERE `nickname` REGEXP '^[一-龥]{2}[0-9]{4}$'
  AND `nickname` NOT LIKE '用户%'
  AND `phone` REGEXP '[0-9]{4}$'
  AND CHAR_LENGTH(`phone`) >= 7;

-- 2) 自检
--    生产实测：10,128 位随机样式 → 10,115 位「用户XXXX」；剩 13 位脏手机号保留原昵称。
--    still_random 应等于脏手机号条数（生产 13、测试库按实际脏数据条数），
--    custom_kept 应为客户自取昵称数（生产 56）。
SELECT 'still_random' AS item, COUNT(*) AS cnt
FROM `c_customer`
WHERE `nickname` REGEXP '^[一-龥]{2}[0-9]{4}$' AND `nickname` NOT LIKE '用户%'
UNION ALL
SELECT 'user_tail', COUNT(*)
FROM `c_customer`
WHERE `nickname` REGEXP '^用户[0-9]{4}$'
UNION ALL
SELECT 'custom_kept', COUNT(*)
FROM `c_customer`
WHERE `nickname` NOT REGEXP '^[一-龥]{2}[0-9]{4}$' AND `nickname` NOT LIKE '用户%';

-- 回滚（按备份表恢复，只影响本次被改写的行）
-- UPDATE `c_customer` c
--   JOIN `c_customer_nickname_bak_20261121` b ON b.`id` = c.`id`
--   SET c.`nickname` = b.`nickname`;