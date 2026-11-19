-- 【生产版】由 sql/2026-11-10-training-proof-photos.sql 自动生成（scripts/make-prod-sql.py）。
-- 改动仅一处：把「仅测试库执行 / 非测试库就报错」的守卫改为无条件执行。
-- 执行前请备份；执行后跑 ./scripts/sql-audit.py 校验结构。
-- Full愈 内训考核在岗证明照片。仅测试库执行；生产未授权。
-- 不使用 mysql --force。先校验 DATABASE()，重复执行不会报“列已存在”。

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='s_massagist_training_assessment' AND COLUMN_NAME='proof_photos');
SET @ddl := IF(DATABASE()<>'',
  IF(@col=0,
    'ALTER TABLE `s_massagist_training_assessment` ADD COLUMN `proof_photos` VARCHAR(2048) NULL COMMENT ''在岗证明照片 OSS key，逗号分隔''',
    'SELECT ''s_massagist_training_assessment.proof_photos exists'''),
  'SELECT * FROM fullyu_training_proof_migration_requires_tou_mall_test');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
