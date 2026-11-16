#!/usr/bin/env bash
# 轻疗（qingliao）生产每日备份
#   目标机：8.133.6.18   2026-11-16 立（生产方案-最终版 批次 0.2）
#   内容：RDS tou_mall_current 全库 + 前台静态 dist + 维护页 + 微信校验目录 + nginx/crontab + jar 指纹
#   保留：本地最近 7 天（KEEP_DAYS 可调，按日期目录名判断，今天这份永不删）
#   异地：OSS fullyu-backup/qingliao/<date>/（30 天生命周期）  日志：/var/log/fu-backup.log
#   用法：fu-backup-qingliao.sh            正常备份
#         fu-backup-qingliao.sh --prune-only   只跑保留清理（DRY_RUN=1 只打印不删）
set -euo pipefail

STAMP=$(date +%F)
BASE=${BACKUP_BASE:-/root/backups/qingliao/daily}
DEST=$BASE/$STAMP
LOG=${BACKUP_LOG:-/var/log/fu-backup.log}
CNF=/etc/fullyu/qingliao-backup.cnf
DB=tou_mall_current
JAR=/server/java/fully/mall-admin-1.0-SNAPSHOT.jar
KEEP=${KEEP_DAYS:-7}

# 保留策略：只认 $BASE 下形如 YYYY-MM-DD 的一级目录，按名字排序留最新 KEEP 份。
# 不用 mtime：目录 mtime 会被 rsync/tar 解包、touch 等干扰；名字即备份日期，最确定。
# 注意：函数里任何"最后一条命令非零"的写法都会让 set -e 直接终结整个备份脚本
#       （presence/teahour 的旧 prune 就这么让 11-14 起的 OSS 上传静默跳过），统一收口到 return 0。
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
chmod 700 /root/backups "$BASE" 2>/dev/null || true
exec >>"$LOG" 2>&1
exec 9>/var/lock/fu-backup-qingliao.lock
flock -n 9 || { echo "$(date '+%F %T') another run in progress, skip"; exit 0; }

if [ "${1:-}" = "--prune-only" ]; then
  prune_old
  echo "=== $(date '+%F %T') prune-only done, keep=$KEEP base=$BASE"
  exit 0
fi

echo "=== $(date '+%F %T') qingliao backup start -> $DEST"
mkdir -p "$DEST"
chmod 700 "$DEST"

# 1) RDS 一致性备份
mysqldump --defaults-extra-file="$CNF" --single-transaction --quick --routines --triggers \
  --no-tablespaces --set-gtid-purged=OFF --default-character-set=utf8mb4 "$DB" | gzip -6 > "$DEST/qingliao.sql.gz"
gzip -t "$DEST/qingliao.sql.gz" || { echo "FATAL dump gzip 损坏"; exit 1; }

# 2) 自校验：线上表数 = dump 内 CREATE TABLE 数；关键表行数写盘
LIVE=$(mysql --defaults-extra-file="$CNF" -N -B -e "select count(*) from information_schema.tables where table_schema='$DB' and table_type='BASE TABLE'")
DUMPC=$(zgrep -c "^CREATE TABLE" "$DEST/qingliao.sql.gz" || true)
printf "tables_live\t%s\ntables_dump\t%s\n" "$LIVE" "$DUMPC" > "$DEST/rows.txt"
for t in s_order c_customer ums_menu ums_role s_massagist; do
  n=$(mysql --defaults-extra-file="$CNF" -N -B -e "select count(*) from \`$DB\`.\`$t\`" 2>/dev/null || echo ERR)
  printf "%s\t%s\n" "$t" "$n" >> "$DEST/rows.txt"
done
if [ "$LIVE" != "$DUMPC" ]; then
  echo "FATAL 表数不一致 live=$LIVE dump=$DUMPC"
  exit 1
fi

# 3) 静态与配置
tar czf "$DEST/web.tgz" -C /server/www/fully dist -C /server/www mall-maint -C /home/www mall-wp
tar tzf "$DEST/web.tgz" >/dev/null || { echo "FATAL web.tgz 损坏"; exit 1; }
nginx -T > "$DEST/nginx-T.conf" 2>/dev/null || echo "nginx -T failed (non-fatal)"
crontab -l > "$DEST/crontab.txt" 2>/dev/null || true
ls -l /etc/nginx/conf.d/*.conf > "$DEST/nginx-conf-list.txt" 2>/dev/null || true

# 4) 清单
(
  cd "$DEST"
  sha256sum qingliao.sql.gz web.tgz 2>/dev/null
  [ -f "$JAR" ] && sha256sum "$JAR"
  echo "--- rows.txt ---"
  cat rows.txt
) > "$DEST/MANIFEST.txt"

# 5) OSS 异地（失败不影响本地）
if [ -x /usr/local/bin/fu-oss-upload.sh ]; then
  /usr/local/bin/fu-oss-upload.sh qingliao "$DEST" || echo "$(date '+%F %T') OSS 异地备份失败，本地已保留"
else
  echo "fu-oss-upload.sh 未安装，跳过异地"
fi

# 6) 本地保留：最近 7 天（放在最后：今天这份已完整落盘、已上传，才允许动老目录）
prune_old

echo "=== $(date '+%F %T') done, size: $(du -sh "$DEST" | cut -f1)"