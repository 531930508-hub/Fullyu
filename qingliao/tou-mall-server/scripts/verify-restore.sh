#!/usr/bin/env bash
# 校验已还原库与生产库的行数是否逐表一致。
# 运行位置: 121.40.119.57（已拷到 /root/bin/）；先按 §7.10 把 dump 导进一个新库
# 用法: verify-restore.sh <restored_db> [source_db]
set -euo pipefail
V="${1:?restored db required}"
SRC="${2:-tou_mall_current}"
CNF=/root/.rds.txt

# --defaults-extra-file 必须是 mysql 的第一个参数，故分两套调用
gen_local() { # $1=db
  mysql -N "$1" -e "
    select concat('select ', quote(table_name), ' t, count(*) c from \`', table_name, '\`')
    from information_schema.tables
    where table_schema='$1' and table_type='BASE TABLE' order by table_name"
}
gen_rds() { # $1=db
  mysql --defaults-extra-file="$CNF" -N "$1" -e "
    select concat('select ', quote(table_name), ' t, count(*) c from \`', table_name, '\`')
    from information_schema.tables
    where table_schema='$1' and table_type='BASE TABLE' order by table_name"
}
join_sql() { paste -sd' ' | sed 's/ select / union all select /g'; }

SQL_V=$(gen_local "$V" | join_sql)
SQL_S=$(gen_rds "$SRC" | join_sql)

mysql -N -e "$SQL_V" "$V" | sort > "/tmp/counts_$V.txt"
mysql --defaults-extra-file="$CNF" -N -e "$SQL_S" "$SRC" | sort > "/tmp/counts_$SRC.txt"

echo "tables: restored=$(wc -l < "/tmp/counts_$V.txt") source=$(wc -l < "/tmp/counts_$SRC.txt")"
echo "rows:   restored=$(awk '{s+=$2} END{print s+0}' "/tmp/counts_$V.txt") source=$(awk '{s+=$2} END{print s+0}' "/tmp/counts_$SRC.txt")"
if diff -q "/tmp/counts_$SRC.txt" "/tmp/counts_$V.txt" >/dev/null; then
  echo "RESULT: ROW COUNTS IDENTICAL (per table)"
else
  echo "RESULT: MISMATCH (source vs restored) ->"
  diff "/tmp/counts_$SRC.txt" "/tmp/counts_$V.txt" | head -40
  exit 2
fi