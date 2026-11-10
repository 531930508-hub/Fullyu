-- Full愈 · 接待工时封顶（按门店配置）
-- 适用：MySQL 5.7/8.0，执行前请先备份。
-- 说明：
--   1. 只新增字段，不改写现有业务数据。
--   2. 接待工时上限 = 该疗愈师当月在该门店的排班在岗分钟 × 门店比例。
--   3. 默认 20%；新开业等门店可单独调整，稳定后再改回 20%。
--   4. 超出上限的接待分钟不计入工时，也不计入计薪；服务工时不受影响。
--   5. 若疗愈师当月没有任何排班记录，则不封顶；仅某门店无排班时，该门店接待不封顶（避免调店漏排班导致工资被清零）。

ALTER TABLE `s_shop`
  ADD COLUMN `reception_cap_percent` TINYINT UNSIGNED NOT NULL DEFAULT 20
    COMMENT '接待工时占排班在岗时长的上限百分比，20=20%';

-- 统一初始化已有门店为默认 20%（重复执行安全）
UPDATE `s_shop` SET `reception_cap_percent` = 20 WHERE `reception_cap_percent` IS NULL;
