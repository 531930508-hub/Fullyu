-- CRM · 轻疗积分历史明细迁移（生产，2026-11-21）
--
-- 背景
--   2026-11-17 生产只迁了余额：crm.point_ledger 里 1335 条 `qlmig:<customerId>` ADJUST（合计 83619）
--   是每人一行汇总，轻疗后台的积分流水页在 2026-11-09 已下线，明细无从查看。
--   生产轻疗的积分写入（CRM_ENABLED）仍未开启，本地 tou_mall_current.s_integration 一直是权威账本，
--   所以这里把本地 4714 行明细重建成 CRM 流水：获得 / 消耗 / 到期，余额按时间顺序滚动。
--
-- 做什么
--   1) 1335 条 `qlmig:` 汇总行先整表归档到 crm.point_ledger_qlmig_backup_20261117，再从流水里删掉
--      （否则同一段历史会被算两遍，会员流水里余额会跳变）；
--   2) ADD → EARN、有效 SUBTRACT → CONSUME、已过期 ADD 的 normal_score → EXPIRE（end_time 时刻）；
--      失败的 SUBTRACT（state=0，已取消/退款）不导，它当时已被本地冲回，导了会重复扣；
--   3) 每个会员的余额从 0 顺推，最后一条 = 轻疗当前可用积分（state=1 且 end_time 未到的 normal_score 之和）；
--      有 2 人对不齐（源数据 normal_score 被人工改过，共差 88 分），补一条 ADJUST 对齐；
--   4) 11-17 之后本地仍在记账，CRM 批次停留在快照：按差额补/扣 point_batches（最老批次优先），
--      让「CRM 余额 = 最后一条流水余额」。这一步只动批次、不写流水：
--      差额本身已经由导进来的历史明细解释，再写一条 ADJUST 会和明细重复计一次。
--      目标余额 = 轻疗当前可用积分 + 该会员 11-17 之后 CRM 侧的手工调整（如总部「补发」），
--      后者只在 CRM 有、本地没有，不能被“对齐”冲掉。
--
-- 幂等
--   事件行 idem_key = `qlhist:<kind>:<s_integration.id>`，对齐/补齐行 = `qlhist:align|gap:<memberId>`，
--   重跑只会命中唯一键跳过；差额为 0 时不再产生新批次。可直接重放。
--
-- 前置
--   * 先把 11-19 之后注册、还没有 ql 身份的 17 个客户导进 CRM（scripts/import-ql-members.cjs），
--     否则他们那几十行明细会因为没有 member 被跳过；
--   * tou_mall_current 与 crm 在同一个 RDS 实例（生产实例 i-bp1ep8ohzkiye9cf08qw），可以直接跨库 JOIN；
--     测试环境库名不同，需把下面的 tou_mall_current 换成测试库名。
--   * s_integration 的时间是北京时间，CRM（Prisma）的 created_at / earned_at / expire_at 存 UTC。
--
-- 执行（在能连到生产 RDS 的机器上，默认库 crm）
--   演练：mysql --defaults-file=... crm < ql-ledger-history-20261121.sql | sed 's/^COMMIT;/ROLLBACK;/' \  ← 见文件末尾
--   正式：mysql --defaults-file=... crm < ql-ledger-history-20261121.sql
--   回滚：数据行按 ref/idem_key 前缀可删；汇总行在 crm.point_ledger_qlmig_backup_20261117。

SET NAMES utf8mb4;
SET time_zone = '+08:00';  -- s_integration 是北京时间，NOW() 也按北京时间算

-- 0. 汇总行归档表（DDL 会隐式提交，必须放在事务外）
CREATE TABLE IF NOT EXISTS crm.point_ledger_qlmig_backup_20261117 LIKE crm.point_ledger;

START TRANSACTION;

-- 1. 归档 + 删除 11-17 的汇总迁移流水
INSERT IGNORE INTO crm.point_ledger_qlmig_backup_20261117
SELECT * FROM crm.point_ledger
WHERE business = 'ql' AND type = 'ADJUST' AND ref LIKE 'qlmig:%';

DELETE FROM crm.point_ledger
WHERE business = 'ql' AND type = 'ADJUST' AND ref LIKE 'qlmig:%';

-- 2. 客户 → 会员（同一手机号合并出来的会员会有 2 条 ql 身份，按会员汇总目标余额）
DROP TEMPORARY TABLE IF EXISTS ql_map;
CREATE TEMPORARY TABLE ql_map (
  member_id VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL PRIMARY KEY,
  local_eff INT NOT NULL
) ENGINE = InnoDB;

INSERT INTO ql_map
SELECT mi.member_id, SUM(COALESCE(b.eff, 0))
FROM (SELECT DISTINCT customer_id FROM tou_mall_current.s_integration) c
JOIN crm.member_identities mi
  ON mi.business = 'ql'
 AND mi.local_user_id = CAST(c.customer_id AS CHAR) COLLATE utf8mb4_unicode_ci
LEFT JOIN (
  SELECT customer_id, SUM(normal_score) AS eff
  FROM tou_mall_current.s_integration
  WHERE type = 1 AND state = 1 AND end_time > NOW()
  GROUP BY customer_id
) b ON b.customer_id = c.customer_id
GROUP BY mi.member_id;

-- 3. 事件明细（ord：同一秒内 获得 < 消耗 < 到期）
DROP TEMPORARY TABLE IF EXISTS ql_ev;
CREATE TEMPORARY TABLE ql_ev (
  member_id VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  kind VARCHAR(8) NOT NULL,
  ord TINYINT NOT NULL,
  src_id BIGINT NOT NULL,
  at_utc DATETIME(3) NOT NULL,
  delta INT NOT NULL,
  note VARCHAR(2000) NOT NULL,
  KEY idx_order (member_id, at_utc, ord, src_id)
) ENGINE = InnoDB;

INSERT INTO ql_ev
SELECT mi.member_id, 'EARN', 1, s.id,
       CONVERT_TZ(s.create_time, '+08:00', '+00:00'),
       s.score,
       CONCAT(IFNULL(s.comment, ''), IF(s.order_id IS NULL, '', CONCAT('（订单 ', s.order_id, '）')))
FROM tou_mall_current.s_integration s
JOIN crm.member_identities mi
  ON mi.business = 'ql'
 AND mi.local_user_id = CAST(s.customer_id AS CHAR) COLLATE utf8mb4_unicode_ci
WHERE s.type = 1
UNION ALL
SELECT mi.member_id, 'CONSUME', 2, s.id,
       CONVERT_TZ(s.create_time, '+08:00', '+00:00'),
       -s.score,
       CONCAT(IFNULL(s.comment, ''), IF(s.order_id IS NULL, '', CONCAT('（订单 ', s.order_id, '）')))
FROM tou_mall_current.s_integration s
JOIN crm.member_identities mi
  ON mi.business = 'ql'
 AND mi.local_user_id = CAST(s.customer_id AS CHAR) COLLATE utf8mb4_unicode_ci
WHERE s.type = 0 AND s.state = 1
UNION ALL
SELECT mi.member_id, 'EXPIRE', 3, s.id,
       CONVERT_TZ(s.end_time, '+08:00', '+00:00'),
       -s.normal_score,
       CONCAT('到期失效：', IFNULL(s.comment, ''))
FROM tou_mall_current.s_integration s
JOIN crm.member_identities mi
  ON mi.business = 'ql'
 AND mi.local_user_id = CAST(s.customer_id AS CHAR) COLLATE utf8mb4_unicode_ci
WHERE s.type = 1 AND s.state = 2 AND s.normal_score > 0;

-- 4. 每个会员按时间顺推余额
DROP TEMPORARY TABLE IF EXISTS ql_run;
CREATE TEMPORARY TABLE ql_run (
  member_id VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  kind VARCHAR(8) NOT NULL,
  ord TINYINT NOT NULL,
  src_id BIGINT NOT NULL,
  at_utc DATETIME(3) NOT NULL,
  delta INT NOT NULL,
  note VARCHAR(2000) NOT NULL,
  bal INT NOT NULL,
  KEY idx_order (member_id, at_utc, ord, src_id)
) ENGINE = InnoDB;

INSERT INTO ql_run
SELECT member_id, kind, ord, src_id, at_utc, delta, note,
       SUM(delta) OVER (
         PARTITION BY member_id
         ORDER BY at_utc, ord, src_id
         ROWS UNBOUNDED PRECEDING
       ) AS bal
FROM ql_ev;

-- 5. 写流水
INSERT INTO crm.point_ledger
  (id, member_id, type, delta, balance_after, business, ref, idem_key, operator_id, operator_name, note, created_at)
SELECT CONCAT('PL-', UUID()), member_id, kind, delta, bal, 'ql',
       CONCAT('qlhist:', LOWER(kind), ':', src_id),
       CONCAT('qlhist:', LOWER(kind), ':', src_id),
       NULL, '轻疗历史导入', note, at_utc
FROM ql_run
ON DUPLICATE KEY UPDATE crm.point_ledger.id = crm.point_ledger.id;

-- 6. 源账本被人工改过、顺推结果和当前可用积分对不齐的会员：补一条对齐流水
INSERT INTO crm.point_ledger
  (id, member_id, type, delta, balance_after, business, ref, idem_key, operator_id, operator_name, note, created_at)
SELECT CONCAT('PL-', UUID()), m.member_id, 'ADJUST', m.local_eff - l.bal, m.local_eff, 'ql',
       CONCAT('qlhist:align:', m.member_id),
       CONCAT('qlhist:align:', m.member_id),
       NULL, '轻疗历史导入', '与轻疗可用积分对齐（源账本 normal_score 被调整过）',
       DATE_ADD(l.at_utc, INTERVAL 1 SECOND)
FROM (
  SELECT member_id, bal, at_utc,
         ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY at_utc DESC, ord DESC, src_id DESC) AS rn
  FROM ql_run
) l
JOIN ql_map m ON m.member_id = l.member_id
WHERE l.rn = 1 AND l.bal <> m.local_eff
ON DUPLICATE KEY UPDATE crm.point_ledger.id = crm.point_ledger.id;

-- 7. 余额对齐：CRM 批次（11-17 快照）→ 轻疗当前可用积分
DROP TEMPORARY TABLE IF EXISTS ql_gap;
CREATE TEMPORARY TABLE ql_gap (
  member_id VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL PRIMARY KEY,
  target INT NOT NULL,
  current_bal INT NOT NULL,
  diff INT NOT NULL
) ENGINE = InnoDB;

INSERT INTO ql_gap
SELECT m.member_id,
       m.local_eff + COALESCE(e.extra, 0),
       COALESCE(pb.bal, 0),
       m.local_eff + COALESCE(e.extra, 0) - COALESCE(pb.bal, 0)
FROM ql_map m
LEFT JOIN (
  SELECT member_id, SUM(remaining) AS bal
  FROM crm.point_batches
  WHERE status = 'ACTIVE' AND expire_at > UTC_TIMESTAMP()
  GROUP BY member_id
) pb ON pb.member_id = m.member_id
LEFT JOIN (
  -- 11-17 基线之外、CRM 侧自己记的调整（总部补发等），本地账本里没有
  SELECT member_id, SUM(IF(ref LIKE 'qlmig:%', 0, delta)) AS extra
  FROM crm.point_ledger
  WHERE idem_key IS NULL OR idem_key NOT LIKE 'qlhist:%'
  GROUP BY member_id
) e ON e.member_id = m.member_id
WHERE m.local_eff + COALESCE(e.extra, 0) <> COALESCE(pb.bal, 0);

-- 7a 少记的补一个批次（过期日与既有批次一致：次年 1 月 1 日 +08）
INSERT INTO crm.point_batches
  (id, member_id, issuer_business, source_ref, amount, remaining, status, earned_at, expire_at)
SELECT CONCAT('PB-', UUID()), g.member_id, 'ql', CONCAT('qlhist:gap:', g.member_id),
       g.diff, g.diff, 'ACTIVE', UTC_TIMESTAMP(3),
       CONVERT_TZ(CONCAT(YEAR(NOW()) + 1, '-01-01 00:00:00'), '+08:00', '+00:00')
FROM ql_gap g
WHERE g.diff > 0
  AND NOT EXISTS (
    SELECT 1 FROM crm.point_ledger l WHERE l.idem_key = CONCAT('qlhist:gap:', g.member_id)
  );

-- 7b 多记的按到期最早优先扣减
DROP TEMPORARY TABLE IF EXISTS ql_cut;
CREATE TEMPORARY TABLE ql_cut (
  id VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL PRIMARY KEY,
  cut INT NOT NULL
) ENGINE = InnoDB;

INSERT INTO ql_cut
SELECT id, GREATEST(0, LEAST(remaining, need - COALESCE(prev, 0)))
FROM (
  SELECT pb.id, pb.remaining,
         SUM(pb.remaining) OVER (
           PARTITION BY pb.member_id
           ORDER BY pb.expire_at, pb.earned_at, pb.id
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
         ) AS prev,
         -g.diff AS need
  FROM crm.point_batches pb
  JOIN ql_gap g ON g.member_id = pb.member_id AND g.diff < 0
  WHERE pb.status = 'ACTIVE' AND pb.remaining > 0
) x
WHERE LEAST(remaining, need - COALESCE(prev, 0)) > 0;

UPDATE crm.point_batches pb
JOIN ql_cut c ON c.id = pb.id
SET pb.status = IF(pb.remaining - c.cut = 0, 'DEPLETED', pb.status),
    pb.remaining = pb.remaining - c.cut;

-- 8. 校验（结果打印在事务里；演练时可对照 SECTION 0 的基线）
SELECT 'baseline_archived' AS chk, COUNT(*) AS n FROM crm.point_ledger_qlmig_backup_20261117
UNION ALL
SELECT CONCAT('ledger_', type), COUNT(*) FROM crm.point_ledger WHERE business = 'ql' GROUP BY type
UNION ALL
SELECT 'ledger_ql_total', COUNT(*) FROM crm.point_ledger WHERE business = 'ql'
UNION ALL
SELECT 'events_expected', COUNT(*) FROM ql_ev
UNION ALL
SELECT 'events_written', COUNT(*) FROM crm.point_ledger WHERE idem_key LIKE 'qlhist:%'
UNION ALL
SELECT 'align_rows', COUNT(*) FROM crm.point_ledger WHERE idem_key LIKE 'qlhist:align:%'
UNION ALL
SELECT 'gap_net_points', COALESCE(SUM(diff), 0) FROM ql_gap
UNION ALL
SELECT 'members_in_map', COUNT(*) FROM ql_map;

-- 8a 流水链式校验：上一条余额 + 本条 delta = 本条余额（应为 0 行）
SELECT COUNT(*) AS chain_breaks
FROM (
  SELECT delta, balance_after,
         LAG(balance_after) OVER (
           PARTITION BY member_id ORDER BY created_at, id
         ) AS prev_bal
  FROM crm.point_ledger WHERE business = 'ql'
) t
WHERE prev_bal IS NOT NULL AND prev_bal + delta <> balance_after;

-- 8b 批次余额 vs 最后一条流水余额（应为 0 行）
SELECT COUNT(*) AS batch_vs_ledger_mismatch
FROM (
  SELECT m.id
  FROM crm.members m
  WHERE EXISTS (SELECT 1 FROM crm.point_ledger l WHERE l.member_id = m.id)
    AND COALESCE((
          SELECT SUM(b.remaining) FROM crm.point_batches b
          WHERE b.member_id = m.id AND b.status = 'ACTIVE' AND b.expire_at > UTC_TIMESTAMP()
        ), 0)
        <> COALESCE((
          SELECT l.balance_after FROM crm.point_ledger l
          WHERE l.member_id = m.id ORDER BY l.created_at DESC, l.id DESC LIMIT 1
        ), 0)
) t;

-- 8c 最后一条流水 vs 轻疗当前余额（应为 0 行；有 CRM 侧手工补发的会员会各差一笔，需人工确认）
SELECT COUNT(*) AS ledger_vs_ql_mismatch
FROM (
  SELECT m.member_id, m.local_eff,
         (SELECT l.balance_after FROM crm.point_ledger l
          WHERE l.member_id = m.member_id ORDER BY l.created_at DESC, l.id DESC LIMIT 1) AS last_bal
  FROM ql_map m
) t
WHERE COALESCE(last_bal, -1) <> local_eff;

-- 8d 负余额检查（应为 0）
SELECT COUNT(*) AS negative_balance_rows FROM crm.point_ledger WHERE business = 'ql' AND balance_after < 0;

COMMIT;

-- 演练时把上面这行 COMMIT 改成 ROLLBACK，或先跑：
--   sed 's/^COMMIT;/ROLLBACK;/' ql-ledger-history-20261121.sql | mysql --defaults-file=... crm
-- 观察 8/8b/8c/8d 的计数无误后再正式执行。
--
-- 收尾（确认无误、观察一段时间后再执行，暂不放进本文件）：
--   DROP TABLE crm.point_ledger_qlmig_backup_20261117;