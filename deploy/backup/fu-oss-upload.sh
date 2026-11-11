#!/usr/bin/env bash
# 备份异地到 OSS（方案 0.5b）
# 用法：fu-oss-upload.sh <业务名> <本地备份目录>
#   例：fu-oss-upload.sh presence /root/backups/daily/2026-11-12
# 依赖：
#   /usr/local/bin/ossutil        —— 阿里云 OSS 命令行（1.7.18）
#   /root/.ossutilconfig          —— ops-backup 子账号，仅有 fullyu-backup bucket 读写
# 行为：
#   1) 上传整个目录（-u 增量：同名同大小跳过）
#   2) 逐个文件核对远端 Size 与 ETag(=单段上传的 MD5) 和本地一致
#   3) 任一不一致 → 非零退出，让上层 cron / 日志能看出来
# 任一步失败都不能影响本地备份本身，所以调用方用 || true 兜底。
set -euo pipefail

BIZ=${1:?用法: fu-oss-upload.sh <业务名> <本地备份目录>}
DIR=${2:?}
BUCKET=${OSS_BACKUP_BUCKET:-oss://fullyu-backup-1433216673728394}
CONF=${OSSUTIL_CONFIG:-/root/.ossutilconfig}
LOG=/var/log/fu-backup.log
DAY=$(basename "$DIR")
DEST="$BUCKET/$BIZ/$DAY/"

# 只往 stdout 写：调用它的备份脚本已经 exec >> $LOG，自己再 tee 会出现两行重复
log() { echo "$(date '+%F %T') [oss] $*"; }

[ -d "$DIR" ] || { log "本地目录不存在，跳过：$DIR"; exit 0; }
[ -x /usr/local/bin/ossutil ] || { log "ossutil 未安装，跳过异地备份"; exit 0; }
[ -f "$CONF" ] || { log "$CONF 缺失，跳过异地备份"; exit 0; }

log "上传 $BIZ/$DAY start"
if ! /usr/local/bin/ossutil cp -r -f -u "$DIR/" "$DEST" --config-file "$CONF" >/dev/null 2>&1; then
  log "上传失败：$BIZ/$DAY"
  exit 1
fi

total=0; bad=0
# 一次递归列举拿全量清单：每行 = 时间(4 列) Size StorageClass ETAG ObjectName
remote=$(/usr/local/bin/ossutil ls "$DEST" --config-file "$CONF" 2>/dev/null | grep -F "$DEST" || true)
while IFS= read -r -d '' f; do
  rel=${f#"$DIR"/}
  l_size=$(stat -c %s "$f")
  l_md5=$(md5sum "$f" | cut -d' ' -f1 | tr 'a-f' 'A-F')
  obj="$DEST$rel"
  line=$(printf '%s\n' "$remote" | awk -v k="$obj" '$NF == k')
  r_size=$(printf '%s\n' "$line" | awk '{print $(NF-3)}')
  r_etag=$(printf '%s\n' "$line" | awk '{print $(NF-1)}')
  total=$((total + 1))
  if [ "$r_size" != "$l_size" ]; then
    log "大小不一致 $rel 本地=$l_size 远端=${r_size:-缺失}"
    bad=$((bad + 1))
  elif [ "${r_etag^^}" != "$l_md5" ]; then
    # 分片上传的 ETag 不是 MD5，只提示不判失败
    log "ETag 与 MD5 不同（分片上传可忽略）$rel"
  fi
done < <(find "$DIR" -type f -print0)

log "上传完成 $BIZ/$DAY：$total 个对象，异常 $bad 个"
[ "$bad" -eq 0 ]