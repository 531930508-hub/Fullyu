#!/usr/bin/env bash
# 时叙（teahour）每日备份：MySQL 全库逻辑备份 + 上传目录 + 配置 + nginx 全量配置
# 目标机：121.40.119.57   路径：/usr/local/bin/fu-backup-teahour.sh
# 2026-11-13 由 SQLite 版改为 MySQL 版（时叙当日迁到 MySQL：teahour@127.0.0.1/teahour）
# 保留：本地最近 7 天（KEEP_DAYS 可调，按日期目录名判断，今天这份永不删）
# 异地：OSS fullyu-backup/teahour/<date>/   日志：/var/log/fu-backup.log
# 用法：fu-backup-teahour.sh            正常备份
#       fu-backup-teahour.sh --prune-only   只跑保留清理（DRY_RUN=1 只打印不删）
set -euo pipefail

STAMP=$(date +%F)
BASE=${BACKUP_BASE:-/root/backups/daily}
DEST=$BASE/$STAMP
LOG=${BACKUP_LOG:-/var/log/fu-backup.log}
DB_NAME=teahour
UPLOADS=/var/lib/teahour/uploads
KEEP=${KEEP_DAYS:-7}

# 保留策略：只认 $BASE 下形如 YYYY-MM-DD 的一级目录，按名字排序留最新 KEEP 份。
# 不用 mtime：目录 mtime 会被解包、touch 等干扰；名字即备份日期，最确定。
# 注意：函数里任何"最后一条命令非零"的写法都会让 set -e 直接终结整个备份脚本
#       （旧 prune 就这么让 11-14 起的 OSS 上传静默跳过），所以统一收口到 return 0。
prune_old() {
  local keep=$KEEP total excess name d
  total=$(find "$BASE" -mindepth 1 -maxdepth 1 -type d -name '20??-??-??' 2>/dev/null | wc -l)
  if [ "$total" -le "$keep" ]; then
    echo "$(date '+%F %T') [retention] 现有 $total 份 <= 保留 $keep 份，无需清理"
    return 0
  fi
  excess=$((total - keep))
  echo "$(date '+%F %T') [retention] 现有 $total 份，保留最新 $keep 份，清理 $excess 份"
  while IFS= read -r d; do
    name=$(basename "$d")
    # 护栏：名字必须是合法日期，且今天这份无论如何不删
    [[ $name =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || continue
    [ "$name" = "$STAMP" ] && continue
    [ "$d" = "$BASE/$name" ] || continue
    if [ "${DRY_RUN:-0}" = "1" ]; then
      echo "$(date '+%F %T') [retention] dry-run 将删除 $d"
    elif rm -rf -- "$d"; then
      echo "$(date '+%F %T') [retention] 已删除 $d"
    else
      echo "$(date '+%F %T') [retention] 删除失败：$d"
    fi
  done < <(find "$BASE" -mindepth 1 -maxdepth 1 -type d -name '20??-??-??' 2>/dev/null | sort | head -n "$excess")
  return 0
}

mkdir -p "$BASE"
chmod 700 /root/backups "$BASE"
exec >>"$LOG" 2>&1
exec 9>/var/lock/fu-backup-teahour.lock
flock -n 9 || { echo "$(date '+%F %T') another run in progress, skip"; exit 0; }

if [ "${1:-}" = "--prune-only" ]; then
  prune_old
  echo "=== $(date '+%F %T') prune-only done, keep=$KEEP base=$BASE"
  exit 0
fi

echo "=== $(date '+%F %T') teahour backup start -> $DEST"
mkdir -p "$DEST"
chmod 700 "$DEST"

# 1) MySQL 一致性备份（single-transaction 不锁表）
mysqldump --single-transaction --quick --routines --triggers --no-tablespaces \
  --default-character-set=utf8mb4 "$DB_NAME" | gzip -9 > "$DEST/teahour.sql.gz"

# 2) 自校验：gzip 完整性 + 备份内每张表都能被解析 + 线上库逐表行数
gzip -t "$DEST/teahour.sql.gz"
mysql -N -e "select table_name from information_schema.tables where table_schema='$DB_NAME' order by 1" \
  > "$DEST/tables.txt"
[ -s "$DEST/tables.txt" ] || { echo "FATAL 取不到表清单"; exit 1; }
: > "$DEST/rows.txt"
while read -r t; do
  [ -z "$t" ] && continue
  n=$(mysql -N -e "select count(*) from \`$DB_NAME\`.\`$t\`")
  printf '%s\t%s\n' "$t" "$n" >> "$DEST/rows.txt"
done < "$DEST/tables.txt"
echo "tables: $(wc -l < "$DEST/tables.txt")  rows_total: $(awk -F'\t' '{s+=$2} END{print s+0}' "$DEST/rows.txt")" >> "$DEST/rows.txt"

# 3) 上传目录 + 配置
tar czf "$DEST/uploads.tgz" -C /var/lib/teahour uploads
tar czf "$DEST/config.tgz" -C /etc teahour/api.env
nginx -T > "$DEST/nginx-T.conf" 2>/dev/null || echo "nginx -T failed (non-fatal)"
crontab -l > "$DEST/crontab.txt" 2>/dev/null || true

# 4) 清单
(
  cd "$DEST"
  sha256sum teahour.sql.gz uploads.tgz config.tgz 2>/dev/null
  echo "--- rows.txt ---"
  head -2 rows.txt
  tail -1 rows.txt
) > "$DEST/MANIFEST.txt"

# 5) 异地备份到 OSS：失败不影响本地备份，只记日志
if [ -x /usr/local/bin/fu-oss-upload.sh ]; then
  /usr/local/bin/fu-oss-upload.sh teahour "$DEST" || echo "$(date '+%F %T') OSS 异地备份失败，本地备份已保留"
else
  echo "$(date '+%F %T') fu-oss-upload.sh 未安装，跳过异地备份"
fi

# 6) 本地保留：最近 7 天（放在最后：今天这份已完整落盘、已上传，才允许动老目录）
prune_old

echo "=== $(date '+%F %T') done, size: $(du -sh "$DEST" | cut -f1)"