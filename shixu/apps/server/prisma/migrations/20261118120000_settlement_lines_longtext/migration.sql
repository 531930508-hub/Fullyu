-- 劳务结算明细（lines_json）在 MySQL 的 TEXT 只有 64KB：一个月多店多段（或几万个段）的明细
-- 一超限就直接 500，SQLite 的 TEXT 无上限所以以前测不出来。改为 LONGTEXT（4GB）对齐。
ALTER TABLE `work_settlements` MODIFY `lines_json` LONGTEXT NOT NULL;