#!/usr/bin/env bash
# 轻疗（qingliao）生产每日备份
#   目标机：8.133.6.18   2026-11-16 立（生产方案-最终版 批次 0.2）
#   内容：RDS tou_mall_current 全库 + 前台静态 dist + 维护页 + 微信校验目录 + nginx/crontab + jar 指纹
#   保留：14 天（最近 3 份永不删）  异地：OSS fullyu-backup/qingliao/<date>/  日志：/var/log/fu-backup.log
set -euo pipefail

STAMP=$(date +%F)
BASE=/root/backups/qingliao/daily
DEST=$BASE/$STAMP
LOG=/var/log/fu-backup.log
CNF=/etc/fullyu/qingliao-backup.cnf
DB=tou_mall_current
JAR=/server/java/fully/mall-admin-1.0-SNAPSHOT.jar

mkdir -p "$BASE"
chmod 700 /root/backups "$BASE" 2>/dev/null || true
exec >>"$LOG" 2>&1
exec 9>/var/lock/fu-backup-qingliao.lock
flock -n 9 || { echo "$(date '+%F %T') another run in progress, skip"; exit 0; }

echo "=== $(date '+%F %T') qingliao backup start -> $DEST"
mkdir -p "$DEST"
chmod 700 "$DEST"

# 1) RDS 一致性备份
mysqldump --defaults-extra-file="$CNF" --single-transaction --quick --routines --triggers \
  --no-tablespaces --default-character-set=utf8mb4 "$DB" | gzip -6 > "$DEST/qingliao.sql.gz"
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

# 5) 保留：14 天，最近 3 份永不删
ls -1dt "$BASE"/*/ 2>/dev/null | tail -n +4 | while read -r d; do
  [ "$(find "$d" -maxdepth 0 -mtime +13 | wc -l)" -gt 0 ] && rm -rf "$d" && echo "pruned $d"
done

# 6) OSS 异地（失败不影响本地）
if [ -x /usr/local/bin/fu-oss-upload.sh ]; then
  /usr/local/bin/fu-oss-upload.sh qingliao "$DEST" || echo "$(date '+%F %T') OSS 异地备份失败，本地已保留"
else
  echo "fu-oss-upload.sh 未安装，跳过异地"
fi

echo "=== $(date '+%F %T') done, size: $(du -sh "$DEST" | cut -f1)"