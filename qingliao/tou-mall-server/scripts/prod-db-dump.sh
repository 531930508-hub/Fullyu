#!/usr/bin/env bash
# 生产库逻辑备份（只读，不动数据）。用法: prod-db-dump.sh [dbname] [outdir]
# 运行位置: 121.40.119.57（已拷到 /root/bin/）；RDS 白名单已含该机
# 依赖: /root/.rds.txt (600) 存 RDS 连接信息; mysqldump 8.4 客户端
# 首次产出见 生产方案-最终版.md §7.10（含 sha256 与还原验证结论）
set -euo pipefail
DB="${1:-tou_mall_current}"
OUT="${2:-/opt/fullyu-mall-backups/db}"
CNF=/root/.rds.txt
TS=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$OUT"
F="$OUT/$DB-$TS.sql.gz"

# 8.4 客户端不支持对 8.0 服务端执行 SHOW BINARY LOG STATUS，故单独取位点
BIN_START=$(mysql --defaults-extra-file="$CNF" -N -e "show master status" 2>/dev/null | tr '\t' ' ')

mysqldump --defaults-extra-file="$CNF" \
  --single-transaction --quick --hex-blob --no-tablespaces \
  --routines --triggers --events \
  --set-gtid-purged=OFF \
  --max-allowed-packet=512M \
  "$DB" | gzip -6 > "$F"

gzip -t "$F"
SRC_TABLES=$(mysql --defaults-extra-file="$CNF" -N -e "select count(*) from information_schema.tables where table_schema='$DB' and table_type='BASE TABLE'")
DUMP_TABLES=$(gzip -dc "$F" | grep -c '^CREATE TABLE')
SIZE=$(stat -c %s "$F")
SUM=$(sha256sum "$F" | cut -d' ' -f1)

{
  echo "db=$DB"
  echo "created_utc=$TS"
  echo "file=$F"
  echo "bytes=$SIZE"
  echo "sha256=$SUM"
  echo "src_tables=$SRC_TABLES"
  echo "dump_tables=$DUMP_TABLES"
  echo "binlog_at_start=$BIN_START"
} | tee "$F.meta"

[ "$SRC_TABLES" = "$DUMP_TABLES" ] || { echo "TABLE COUNT MISMATCH"; exit 3; }
echo "OK $F"