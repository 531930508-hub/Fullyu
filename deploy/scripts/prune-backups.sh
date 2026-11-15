#!/usr/bin/env bash
# 保留每个目录下每种前缀（dist.bak-* / h5.bak-*）最新的 N 份备份，其余删除。
# 用法: prune-backups.sh [--keep N] [--dry-run] <dir> [<dir> ...]
# 说明: 备份目录名以 YYYYMMDD-HHMMSS 结尾，字典序即时间序；只在指定目录的直接子目录中按前缀匹配。
set -euo pipefail

keep=2
dry=0
dirs=()
PREFIXES=('dist.bak-' 'h5.bak-')

usage() { sed -n '2,4p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --keep)
      [ $# -ge 2 ] || { echo "--keep 缺少参数" >&2; exit 64; }
      keep="$2"; shift 2 ;;
    --dry-run) dry=1; shift ;;
    -h|--help) usage; exit 0 ;;
    --) shift; while [ $# -gt 0 ]; do dirs+=("$1"); shift; done ;;
    -*) echo "未知参数: $1" >&2; usage >&2; exit 64 ;;
    *) dirs+=("$1"); shift ;;
  esac
done

case "$keep" in ''|*[!0-9]*) echo "--keep 必须是正整数" >&2; exit 64 ;; esac
[ "$keep" -ge 1 ] || { echo "--keep 必须 >= 1" >&2; exit 64; }
[ ${#dirs[@]} -gt 0 ] || { echo "至少需要一个目录" >&2; usage >&2; exit 64; }

removed=0
for dir in "${dirs[@]}"; do
  if [ ! -d "$dir" ]; then
    echo "跳过（不存在）: $dir"
    continue
  fi

  # 按前缀分组，各自只保留最新 $keep 份，避免两类备份互相挤掉
  for prefix in "${PREFIXES[@]}"; do
    olds=()
    while IFS= read -r path; do
      [ -n "$path" ] || continue
      olds+=("$(basename "$path")")
    done < <(find "$dir" -mindepth 1 -maxdepth 1 -type d -name "${prefix}*" \
             | LC_ALL=C sort -r | tail -n +$((keep + 1)))

    for name in ${olds[@]+"${olds[@]}"}; do
      case "$name" in
        "$prefix"*) ;;
        *) echo "忽略非法名称: $dir/$name" >&2; continue ;;
      esac
      if [ "$dry" = 1 ]; then
        echo "[dry-run] 将删除 $dir/$name"
      else
        rm -rf -- "$dir/$name"
        echo "已删除 $dir/$name"
      fi
      removed=$((removed + 1))
    done
  done

  left=$(find "$dir" -mindepth 1 -maxdepth 1 -type d \
           \( -name 'dist.bak-*' -o -name 'h5.bak-*' \) | wc -l | tr -d ' ')
  echo "检查完成: $dir 现有备份 ${left} 份（每种前缀上限 ${keep}）"
done

label=""
if [ "$dry" = 1 ]; then
  label="（dry-run）"
fi
echo "共${label}处理 ${removed} 个旧备份"