#!/usr/bin/env bash
# 生产库逻辑备份（只读，不动数据）。用法: prod-db-dump.sh [dbname] [outdir]
# 运行位置: 测试机 8.133.6.18（/root/bin/prod-db-dump.sh，deploy-prod.sh 每次会覆盖上传一份）；
#           RDS 白名单已含该机，生产应用机 120.55.36.3 不直连库。
# 依赖: RDS 连接信息文件（自动探测 /root/.rds.txt 或 /opt/fullyu-mall-test/.rds.cnf，600）; mysqldump 8.x 客户端
# 首次产出见 生产方案-最终版.md §7.10（含 sha256 与还原验证结论）
set -euo pipefail
DB="${1:-tou_mall_current}"
OUT="${2:-/opt/fullyu-mall-backups/db}"
# 11-17 测试机搬迁后 /root/.rds.txt 没了，凭据挪到 /opt/fullyu-mall-test/.rds.cnf；两边都认，别写死
CNF="${SQL_CNF:-}"
if [ -z "$CNF" ]; then
  for f in /root/.rds.txt /opt/fullyu-mall-test/.rds.cnf /root/.rds.cnf; do
    [ -f "$f" ] && { CNF=$f; break; }
  done
fi
[ -n "$CNF" ] || { echo "找不到 RDS 凭据（试过 /root/.rds.txt、/opt/fullyu-mall-test/.rds.cnf、/root/.rds.cnf）" >&2; exit 3; }
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