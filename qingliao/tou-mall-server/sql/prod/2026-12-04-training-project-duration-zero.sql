-- 【生产版】由 sql/2026-12-04-training-project-duration-zero.sql 自动生成（scripts/make-prod-sql.py）。
-- 改动仅一处：把「仅测试库执行 / 非测试库就报错」的守卫改为无条件执行。
-- 执行前请备份；执行后跑 ./scripts/sql-audit.py 校验结构。
-- 2026-12-04 培训项目时长「0 = 不限」归一
-- 背景：设置页没填时长时存的是 0，而匹配逻辑此前把非 NULL 的时长当成硬约束，
--       等于要求订单时长恰好 0 分钟 —— 舒筋 6 个部位、耳部一条订单都命中不了，
--       看板上这些项目进度恒为 0。
-- 处理：代码侧已把 <=0 视为不限（IncentiveConfigService.toRule + TrainingCalculator.matches），
--       这里再把存量数据归一回 NULL，避免设置页显示成「0 分钟」误导。
-- 可重复执行；只在 tou_mall_test 生效，生产由 scripts/make-prod-sql.py 生成。

SET @right_db = IF(DATABASE()<>'', 1, 0);

UPDATE s_training_project_config
SET duration_minutes = NULL
WHERE @right_db = 1
  AND duration_minutes = 0;

SELECT project_key, project_group, duration_minutes, target_count, amount
FROM s_training_project_config
ORDER BY sort;
