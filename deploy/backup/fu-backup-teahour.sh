#!/usr/bin/env bash
# 时叙（teahour）每日备份：SQLite 一致性副本 + 上传目录 + 配置 + nginx 全量配置
# 目标机：121.40.119.57   路径：/usr/local/bin/fu-backup-teahour.sh
# 保留：14 天（最近 3 份永不删）   日志：/var/log/fu-backup.log
set -euo pipefail

STAMP=$(date +%F)
BASE=/root/backups/daily
DEST=$BASE/$STAMP
LOG=/var/log/fu-backup.log
DB=/var/lib/teahour/teahour.db
UPLOADS=/var/lib/teahour/uploads

mkdir -p "$BASE"
chmod 700 /root/backups "$BASE"
exec >>"$LOG" 2>&1
exec 9>/var/lock/fu-backup-teahour.lock
flock -n 9 || { echo "$(date '+%F %T') another run in progress, skip"; exit 0; }

echo "=== $(date '+%F %T') teahour backup start -> $DEST"
mkdir -p "$DEST"
chmod 700 "$DEST"

# 1) SQLite 一致性副本（用 backup API，避免拷到写了一半的页）
python3 - "$DB" "$DEST/teahour.db" <<'PY'
import sqlite3, sys
src, dst = sys.argv[1], sys.argv[2]
s = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
d = sqlite3.connect(dst)
s.backup(d)
d.close(); s.close()
PY

# 2) 自校验：integrity_check + 逐表行数
python3 - "$DEST/teahour.db" > "$DEST/rows.txt" <<'PY'
import sqlite3, sys
c = sqlite3.connect(sys.argv[1])
print("integrity_check:", c.execute("pragma integrity_check").fetchone()[0])
names = [r[0] for r in c.execute(
    "select name from sqlite_master where type='table' "
    "and name not like 'sqlite_%' and name not like '_prisma%' order by name")]
print("tables:", len(names))
for n in names:
    print(f"{n}\t{c.execute(f'select count(*) from \"{n}\"').fetchone()[0]}")
PY
if ! grep -q "integrity_check: ok" "$DEST/rows.txt"; then
  echo "FATAL integrity_check failed, keep dir for inspection: $DEST"
  exit 1
fi

# 3) 上传目录 + 配置
tar czf "$DEST/uploads.tgz" -C /var/lib/teahour uploads
tar czf "$DEST/config.tgz" -C /etc teahour/api.env
nginx -T > "$DEST/nginx-T.conf" 2>/dev/null || echo "nginx -T failed (non-fatal)"
crontab -l > "$DEST/crontab.txt" 2>/dev/null || true

# 4) 清单
(
  cd "$DEST"
  sha256sum teahour.db uploads.tgz config.tgz 2>/dev/null
  echo "--- rows.txt ---"
  head -2 rows.txt
) > "$DEST/MANIFEST.txt"

# 5) 保留策略：14 天，但最近 3 份永不删
ls -1dt "$BASE"/*/ 2>/dev/null | tail -n +4 | while read -r d; do
  [ "$(find "$d" -maxdepth 0 -mtime +13 | wc -l)" -gt 0 ] && rm -rf "$d" && echo "pruned $d"
done

echo "=== $(date '+%F %T') done, size: $(du -sh "$DEST" | cut -f1)"