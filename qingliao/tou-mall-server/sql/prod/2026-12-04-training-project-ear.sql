-- 【生产版】由 sql/2026-12-04-training-project-ear.sql 自动生成（scripts/make-prod-sql.py）。
-- 改动仅一处：把「仅测试库执行 / 非测试库就报错」的守卫改为无条件执行。
-- 执行前请备份；执行后跑 ./scripts/sql-audit.py 校验结构。
-- 2026-12-04 新增培训项目「耳」（全感悦耳 · 耳部）+ 历史 4 格补录
-- 背景：历史《疗愈师培训考核表》里「耳」列有 4 格记录（2 格已计发、2 格仅通过时间），
--       系统原先没有该项目配置，导入脚本把它们列入「未配置项目」跳过。
-- 口径：ear（全感悦耳 · 耳部），达标 30 单 / 500 元，别名 耳、耳部、采耳；
--       耳部疗程单次短、单量大，所以门槛按 30 单，金额与舒筋各部位一致。
--       已计发的两格写 paid_month，计算器显示「已计发」，不再重复计发。
-- 可重复执行：配置行按 project_key 幂等判重，考核记录按 uk_massagist_project 幂等。
-- 只在 tou_mall_test 生效；生产由 scripts/make-prod-sql.py 生成。

SET @right_db = IF(DATABASE()<>'', 1, 0);

-- 1. 项目配置：挂到当前生效的参数版本上
SET @cfg_id := (SELECT c.id FROM s_incentive_config c
  WHERE c.status = 1
  ORDER BY c.effective_month DESC, c.revision DESC
  LIMIT 1);

INSERT INTO s_training_project_config
  (config_id, project_key, project_group, project_name, project_id, part_name, aliases,
   duration_minutes, target_count, amount, enabled, sort, create_time)
SELECT @cfg_id, 'ear', '全感悦耳', '耳部', NULL, '耳部', '耳,耳部,采耳',
       NULL, 30, 500.00, 1, 9, NOW()
FROM DUAL
WHERE @right_db = 1
  AND @cfg_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM s_training_project_config p
                  WHERE p.config_id = @cfg_id AND p.project_key = 'ear');

-- 2. 历史考核记录：刘萌萌 / 王萌 已计发，于言曦 / 张娜 仅通过时间
INSERT INTO s_massagist_training_cert
  (massagist_id, shop_id, project_key, passed_at, source, paid_month, paid_amount,
   create_time, update_time)
SELECT m.id, m.shop_id, 'ear', '2026-01-20', 'LEGACY', '2026-02', 500.00, NOW(), NOW()
FROM s_massagist m LEFT JOIN s_shop s ON s.id = m.shop_id
WHERE @right_db = 1
  AND ((m.real_name = '刘萌萌') OR (m.name = '刘萌萌'))
  AND (SELECT COUNT(*) FROM s_massagist m2 LEFT JOIN s_shop s2 ON s2.id = m2.shop_id
       WHERE ((m2.real_name = '刘萌萌') OR (m2.name = '刘萌萌'))) = 1
ON DUPLICATE KEY UPDATE
  passed_at   = IFNULL(passed_at, VALUES(passed_at)),
  paid_amount = IF(paid_month IS NULL, VALUES(paid_amount), paid_amount),
  paid_month  = IF(paid_month IS NULL OR paid_month = VALUES(paid_month),
                   VALUES(paid_month), paid_month),
  update_time = NOW();

INSERT INTO s_massagist_training_cert
  (massagist_id, shop_id, project_key, passed_at, source, paid_month, paid_amount,
   create_time, update_time)
SELECT m.id, m.shop_id, 'ear', '2025-11-30', 'LEGACY', '2025-11', 500.00, NOW(), NOW()
FROM s_massagist m LEFT JOIN s_shop s ON s.id = m.shop_id
WHERE @right_db = 1
  AND ((m.real_name = '王萌') OR (m.name = '王萌'))
  AND (SELECT COUNT(*) FROM s_massagist m2 LEFT JOIN s_shop s2 ON s2.id = m2.shop_id
       WHERE ((m2.real_name = '王萌') OR (m2.name = '王萌'))) = 1
ON DUPLICATE KEY UPDATE
  passed_at   = IFNULL(passed_at, VALUES(passed_at)),
  paid_amount = IF(paid_month IS NULL, VALUES(paid_amount), paid_amount),
  paid_month  = IF(paid_month IS NULL OR paid_month = VALUES(paid_month),
                   VALUES(paid_month), paid_month),
  update_time = NOW();

INSERT INTO s_massagist_training_cert
  (massagist_id, shop_id, project_key, passed_at, source, paid_month, paid_amount,
   create_time, update_time)
SELECT m.id, m.shop_id, 'ear', '2026-11-15', 'LEGACY', NULL, NULL, NOW(), NOW()
FROM s_massagist m LEFT JOIN s_shop s ON s.id = m.shop_id
WHERE @right_db = 1
  AND ((m.real_name = '于言曦') OR (m.name = '于言曦'))
  AND (SELECT COUNT(*) FROM s_massagist m2 LEFT JOIN s_shop s2 ON s2.id = m2.shop_id
       WHERE ((m2.real_name = '于言曦') OR (m2.name = '于言曦'))) = 1
ON DUPLICATE KEY UPDATE
  passed_at   = IFNULL(passed_at, VALUES(passed_at)),
  paid_amount = IF(paid_month IS NULL, VALUES(paid_amount), paid_amount),
  paid_month  = IF(paid_month IS NULL OR paid_month = VALUES(paid_month),
                   VALUES(paid_month), paid_month),
  update_time = NOW();

INSERT INTO s_massagist_training_cert
  (massagist_id, shop_id, project_key, passed_at, source, paid_month, paid_amount,
   create_time, update_time)
SELECT m.id, m.shop_id, 'ear', '2026-10-31', 'LEGACY', NULL, NULL, NOW(), NOW()
FROM s_massagist m LEFT JOIN s_shop s ON s.id = m.shop_id
WHERE @right_db = 1
  AND ((m.real_name = '张娜') OR (m.name = '张娜'))
  AND (SELECT COUNT(*) FROM s_massagist m2 LEFT JOIN s_shop s2 ON s2.id = m2.shop_id
       WHERE ((m2.real_name = '张娜') OR (m2.name = '张娜'))) = 1
ON DUPLICATE KEY UPDATE
  passed_at   = IFNULL(passed_at, VALUES(passed_at)),
  paid_amount = IF(paid_month IS NULL, VALUES(paid_amount), paid_amount),
  paid_month  = IF(paid_month IS NULL OR paid_month = VALUES(paid_month),
                   VALUES(paid_month), paid_month),
  update_time = NOW();

-- 3. 复核：应看到 1 个 ear 配置、4 条 ear 考核记录（其中 2 条已计发）
SELECT 'config' AS kind, project_key, project_name, target_count, amount
FROM s_training_project_config WHERE project_key = 'ear';
SELECT c.project_key, m.name, m.real_name, c.passed_at, c.paid_month, c.paid_amount
FROM s_massagist_training_cert c JOIN s_massagist m ON m.id = c.massagist_id
WHERE c.project_key = 'ear' ORDER BY c.passed_at;
