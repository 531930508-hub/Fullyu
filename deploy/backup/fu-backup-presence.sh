#!/usr/bin/env bash
# 在场（presence）每日备份：RDS `fullyu` 逻辑备份 + 应用配置 + 前端产物 + nginx 全量配置 + PM2 清单
# 目标机：120.55.36.3   路径：/usr/local/bin/fu-backup-presence.sh
# 保留：本地最近 7 天（KEEP_DAYS 可调，按日期目录名判断，今天这份永不删）
# 异地：OSS fullyu-backup/presence/<date>/   日志：/var/log/fu-backup.log
# 用法：fu-backup-presence.sh            正常备份
#       fu-backup-presence.sh --prune-only   只跑保留清理（DRY_RUN=1 只打印不删）
set -euo pipefail

STAMP=$(date +%F)
BASE=${BACKUP_BASE:-/root/backups/daily}
DEST=$BASE/$STAMP
LOG=${BACKUP_LOG:-/var/log/fu-backup.log}
APP=/root/fullyu/apps/server
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
exec 9>/var/lock/fu-backup-presence.lock
flock -n 9 || { echo "$(date '+%F %T') another run in progress, skip"; exit 0; }

if [ "${1:-}" = "--prune-only" ]; then
  prune_old
  echo "=== $(date '+%F %T') prune-only done, keep=$KEEP base=$BASE"
  exit 0
fi

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

# 6) 异地备份到 OSS（0.5b）：失败不影响本地备份，只记日志
if [ -x /usr/local/bin/fu-oss-upload.sh ]; then
  /usr/local/bin/fu-oss-upload.sh presence "$DEST" || echo "$(date '+%F %T') OSS 异地备份失败，本地备份已保留"
else
  echo "$(date '+%F %T') fu-oss-upload.sh 未安装，跳过异地备份"
fi

# 7) 本地保留：最近 7 天（放在最后：今天这份已完整落盘、已上传，才允许动老目录）
prune_old

echo "=== $(date '+%F %T') done, size: $(du -sh "$DEST" | cut -f1)"