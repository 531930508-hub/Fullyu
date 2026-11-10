#!/usr/bin/env bash
# 部署前备份静态产物，并自动只保留最新 N 份（默认 2），避免 dist.bak-* 无限堆积。
# 用法: backup-dist.sh [--keep N] [--prefix dist.bak-|h5.bak-] [--dry-run] <目标目录>
# 示例:
#   backup-dist.sh /opt/fullyu/apps/admin
#   backup-dist.sh --prefix h5.bak- /opt/fullyu/apps/miniprogram/dist/build
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PRUNE="$SCRIPT_DIR/prune-backups.sh"

keep=2
prefix="dist.bak-"
dry=0
dir=""

while [ $# -gt 0 ]; do
  case "$1" in
    --keep)   keep="$2"; shift 2 ;;
    --prefix) prefix="$2"; shift 2 ;;
    --dry-run) dry=1; shift ;;
    -h|--help) sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "未知参数: $1" >&2; exit 64 ;;
    *) dir="$1"; shift ;;
  esac
done

[ -n "$dir" ] || { echo "缺少目标目录" >&2; exit 64; }
[ -d "$dir" ] || { echo "目录不存在: $dir" >&2; exit 66; }
case "$prefix" in
  dist.bak-|h5.bak-) ;;
  *) echo "--prefix 只允许 dist.bak- 或 h5.bak-" >&2; exit 64 ;;
esac

ts=$(date +%Y%m%d-%H%M%S)
dest="$dir/${prefix}${ts}"
if [ -e "$dest" ]; then
  dest="$dest-$$"
fi

if [ "$dry" = 1 ]; then
  echo "[dry-run] 将备份 $dir -> $dest"
else
  mkdir -p "$dest"
  # 排除历史备份目录，避免把备份再备份进去
  rsync -a --exclude='dist.bak-*' --exclude='h5.bak-*' "$dir/" "$dest/"
  echo "已备份 $dir -> $dest"
fi

prune_args=(--keep "$keep")
if [ "$dry" = 1 ]; then
  prune_args+=(--dry-run)
fi
"$PRUNE" "${prune_args[@]}" "$dir"