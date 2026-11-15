-- 【生产版】由 sql/2026-12-01-order-visit-no-backfill.sql 自动生成（scripts/make-prod-sql.py）。
-- 改动仅一处：把「仅测试库执行 / 非测试库就报错」的守卫改为无条件执行。
-- 执行前请备份；执行后跑 ./scripts/sql-audit.py 校验结构。
-- 2026-12-01 到店次数历史数据回填（静态自然日编号）
-- 背景：visit_no 从「下单时静态写入」改为全量口径后，历史单仍是 NULL，展示靠实时回退。
-- 本脚本按代码同一口径把历史数据一次性刷成静态编号，之后展示不再依赖实时统计。
--
-- 必须在上线顺序的最后执行：先 2026-11-30-order-visit-no.sql（加列）→ 换新 jar → 再跑本脚本。
-- 口径与 OrderService#isVisitCounted / planVisitNo 完全一致：
--   1) 服务日 = 该单明细里最早的 start_time 的日期；同一天多单只算一次到店，共用同一个序号
--   2) 只统计 产品单(type=0) 且 state ∈ (0,1,2) 且 appointment_state ∈ (0,1,2)
--   3) 序号 = 该客户按服务日升序的密集排名（DENSE_RANK）
--   4) 取消(4)/超时(3)/退款中(5)/已退款(6)/审批退款中(7)、预约已取消(3)、非产品单：编号置空
-- 可重复执行（结果幂等）；只在 tou_mall_test 生效，生产版由 scripts/make-prod-sql.py 生成

SET @right_db = IF(DATABASE()<>'', 1, 0);

-- 0) 回填前留底（只在第一次执行时取一次）
-- 注意：不能用"备份表行数=0"判断是否初次执行——生产上本来就没有历史编号，
-- 首次快照天然是空集，于是第二遍会被误判成"还没跑过"，把回填后的值当"原值"存下来
-- （2026-11-13 实测：pass1 备份 0 行 → pass2 变成 19439 行）。改用哨兵表判首次。
CREATE TABLE IF NOT EXISTS `s_order_visit_no_bak_20261201` (
    `id`          BIGINT NOT NULL COMMENT '订单 id',
    `customer_id` BIGINT NULL COMMENT '客户 id',
    `visit_no`    INT    NULL COMMENT '回填前的编号（多为 NULL）',
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS `s_order_visit_no_bak_20261201_done` (
    `done` TINYINT NOT NULL COMMENT '哨兵：本脚本已取过快照',
    PRIMARY KEY (`done`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

SET @first_run_20261201 = (SELECT COUNT(*) = 0 FROM `s_order_visit_no_bak_20261201_done`);

INSERT IGNORE INTO `s_order_visit_no_bak_20261201` (`id`, `customer_id`, `visit_no`)
SELECT `id`, `customer_id`, `visit_no` FROM `s_order`
WHERE @right_db = 1 AND @first_run_20261201 = 1 AND `visit_no` IS NOT NULL;

INSERT IGNORE INTO `s_order_visit_no_bak_20261201_done` (`done`) VALUES (1);

-- 1) 不占号的订单清空编号（取消/退款/超时/非产品单）
UPDATE `s_order`
SET `visit_no` = NULL
WHERE @right_db = 1
  AND `visit_no` IS NOT NULL
  AND (`type` <> 0
       OR `state` NOT IN (0, 1, 2)
       OR `appointment_state` NOT IN (0, 1, 2));

-- 2) 占号的订单按自然日密集排名重算（不加 where visit_no 条件，保证口径统一）
UPDATE `s_order` o
    JOIN (
        SELECT r.`order_id`, r.`rn`
        FROM (
            SELECT o2.`id`                                                     AS `order_id`,
                   DENSE_RANK() OVER (PARTITION BY o2.`customer_id` ORDER BY d.`svc_date`) AS `rn`
            FROM `s_order` o2
                     JOIN (SELECT `order_id`, DATE(MIN(`start_time`)) AS `svc_date`
                           FROM `oms_order_detail`
                           WHERE `start_time` IS NOT NULL
                           GROUP BY `order_id`) d ON d.`order_id` = o2.`id`
            WHERE o2.`type` = 0
              AND o2.`state` IN (0, 1, 2)
              AND o2.`appointment_state` IN (0, 1, 2)
        ) r
    ) t ON t.`order_id` = o.`id`
SET o.`visit_no` = t.`rn`
WHERE @right_db = 1
  AND NOT (o.`visit_no` <=> t.`rn`);

-- 3) 自检（三项都应为 0）
-- 3.1 占号订单里仍有 NULL 的，只可能是明细缺失（无服务日期）
SELECT COUNT(*) AS counted_without_visit_no
FROM `s_order` o
WHERE `type` = 0
  AND `state` IN (0, 1, 2)
  AND `appointment_state` IN (0, 1, 2)
  AND `visit_no` IS NULL;

-- 3.2 同客户同一天出现多个编号 = 排序错乱
SELECT COUNT(*) AS customer_day_conflict
FROM (SELECT o.`customer_id`, d.`svc_date`, COUNT(DISTINCT o.`visit_no`) AS nos
      FROM `s_order` o
               JOIN (SELECT `order_id`, DATE(MIN(`start_time`)) AS `svc_date`
                     FROM `oms_order_detail`
                     WHERE `start_time` IS NOT NULL
                     GROUP BY `order_id`) d ON d.`order_id` = o.`id`
      WHERE o.`type` = 0
        AND o.`state` IN (0, 1, 2)
        AND o.`appointment_state` IN (0, 1, 2)
      GROUP BY o.`customer_id`, d.`svc_date`
      HAVING nos > 1) x;

-- 3.3 不该有编号的订单仍有编号（应为 0）
SELECT COUNT(*) AS uncounted_with_visit_no
FROM `s_order`
WHERE `visit_no` IS NOT NULL
  AND (`type` <> 0
       OR `state` NOT IN (0, 1, 2)
       OR `appointment_state` NOT IN (0, 1, 2));

-- 3.4 抽样：最近 10 个产品单的编号
SELECT `id`, `customer_id`, `state`, `appointment_state`, `visit_no`
FROM `s_order`
WHERE `type` = 0
ORDER BY `id` DESC
LIMIT 10;