-- 劳务结算明细 work_settlements.lines_json：TEXT（64KB）→ LONGTEXT（4GB）
-- 生产 MySQL 手工执行（仓库内 prisma/migrations 是开发方言，与本文一致）。
--
-- 为什么必须改：一个月多店多段的结算明细很容易超过 64KB，超了写库直接报
-- 「Data too long for column 'lines_json'」，月结单永远生成不了。SQLite 的 TEXT 无上限，
-- 所以这条在 SQLite 阶段测不出来，切 MySQL 后才暴露（见 design-2026-11-16 第 14 节）。
--
-- 安全性与回滚：
--   * 只放宽列类型，不丢数据、不改数据语义，旧版本 server 读 LONGTEXT 同样正常；
--   * MySQL 8 对 TEXT→LONGTEXT 需要重建表（35 表的小库，秒级），执行时会短暂锁表，
--     建议低峰执行；
--   * 不设默认值：MySQL 的 TEXT 系默认值只能写表达式，服务端每次都会显式写入。
--
-- 执行后需同步新 dist（含新 prisma client）并重启 teahour-api。

ALTER TABLE `work_settlements` MODIFY `lines_json` LONGTEXT NOT NULL;

-- 校验：应显示 longtext
-- SHOW COLUMNS FROM `work_settlements` LIKE 'lines_json';