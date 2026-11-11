#!/usr/bin/env bash
# 在场（presence）每日备份：RDS `fullyu` 逻辑备份 + 应用配置 + 前端产物 + nginx 全量配置 + PM2 清单
# 目标机：120.55.36.3   路径：/usr/local/bin/fu-backup-presence.sh
# 保留：14 天（最近 3 份永不删）   日志：/var/log/fu-backup.log
set -euo pipefail

STAMP=$(date +%F)
BASE=/root/backups/daily
DEST=$BASE/$STAMP
LOG=/var/log/fu-backup.log
APP=/root/fullyu/apps/server

mkdir -p "$BASE"
chmod 700 /root/backups "$BASE"
exec >>"$LOG" 2>&1
exec 9>/var/lock/fu-backup-presence.lock
flock -n 9 || { echo "$(date '+%F %T') another run in progress, skip"; exit 0; }

echo "=== $(date '+%F %T') presence backup start -> $DEST"
mkdir -p "$DEST"
chmod 700 "$DEST"

# 1) 从 .env.local 取 DATABASE_URL（文件内唯一权威来源），密码走环境变量不进命令行
URL=$(grep -m1 '^DATABASE_URL=' "$APP/.env.local" | cut -d= -f2- | tr -d '"')
[ -n "$URL" ] || { echo "FATAL DATABASE_URL not found in $APP/.env.local"; exit 1; }
REST=${URL#mysql://}
CRED=${REST%%@*}
DBHOSTPORT=${REST#*@}; DBHOSTPORT=${DBHOSTPORT%%/*}
DBNAME=${REST##*/}; DBNAME=${DBNAME%%\?*}
DBUSER=${CRED%%:*}
DBPASS=${CRED#*:}
DBHOST=${DBHOSTPORT%%:*}
DBPORT=${DBHOSTPORT##*:}; [ "$DBPORT" = "$DBHOST" ] && DBPORT=3306

export MYSQL_PWD=$DBPASS

# 2) 逻辑备份（一致性快照，不锁表）
mysqldump -h "$DBHOST" -P "$DBPORT" -u "$DBUSER" \
  --single-transaction --quick --no-tablespaces --set-gtid-purged=OFF \
  --default-character-set=utf8mb4 --hex-blob \
  "$DBNAME" > "$DEST/$DBNAME.sql"
gzip -f "$DEST/$DBNAME.sql"
gzip -t "$DEST/$DBNAME.sql.gz" || { echo "FATAL gzip verify failed"; exit 1; }

# 3) 结构校验：dump 里的建表数 vs 线上 information_schema 表数
DUMP_TBLS=$(gunzip -c "$DEST/$DBNAME.sql.gz" | grep -c '^CREATE TABLE' || true)
LIVE_TBLS=$(mysql -h "$DBHOST" -P "$DBPORT" -u "$DBUSER" -N -e \
  "select count(*) from information_schema.tables where table_schema='$DBNAME'")
echo "tables: dump=$DUMP_TBLS live=$LIVE_TBLS db=$DBNAME host=$DBHOST" | tee "$DEST/verify.txt"
[ "$DUMP_TBLS" -eq "$LIVE_TBLS" ] || { echo "FATAL table count mismatch"; exit 1; }
# 关键表行数快照（用于恢复演练比对）
mysql -h "$DBHOST" -P "$DBPORT" -u "$DBUSER" -N -e "
  select table_name, table_rows from information_schema.tables
  where table_schema='$DBNAME' order by table_name" > "$DEST/row-estimates.tsv"

# 4) 配置与产物
tar czf "$DEST/config.tgz" -C "$APP" .env .env.local 2>/dev/null || tar czf "$DEST/config.tgz" -C "$APP" .env
nginx -T > "$DEST/nginx-T.conf" 2>/dev/null || echo "nginx -T failed (non-fatal)"
pm2 jlist > "$DEST/pm2-jlist.json" 2>/dev/null || true
crontab -l > "$DEST/crontab.txt" 2>/dev/null || true
tar czf "$DEST/dist-admin.tgz" -C /opt/fullyu/apps admin/dist 2>/dev/null || true
tar czf "$DEST/dist-h5.tgz" -C /opt/fullyu/apps miniprogram/dist/build/h5 2>/dev/null || true

# 5) 清单
( cd "$DEST"; sha256sum "$DBNAME.sql.gz" config.tgz 2>/dev/null; echo "--- verify ---"; cat verify.txt ) > "$DEST/MANIFEST.txt"

# 6) 保留策略：14 天，但最近 3 份永不删
ls -1dt "$BASE"/*/ 2>/dev/null | tail -n +4 | while read -r d; do
  [ "$(find "$d" -maxdepth 0 -mtime +13 | wc -l)" -gt 0 ] && rm -rf "$d" && echo "pruned $d"
done

# 7) 异地备份到 OSS（0.5b）：失败不影响本地备份，只记日志
if [ -x /usr/local/bin/fu-oss-upload.sh ]; then
  /usr/local/bin/fu-oss-upload.sh presence "$DEST" || echo "$(date '+%F %T') OSS 异地备份失败，本地备份已保留"
else
  echo "$(date '+%F %T') fu-oss-upload.sh 未安装，跳过异地备份"
fi

echo "=== $(date '+%F %T') done, size: $(du -sh "$DEST" | cut -f1)"