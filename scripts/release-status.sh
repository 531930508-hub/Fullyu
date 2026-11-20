#!/usr/bin/env bash
# 线上版本账本：查每个项目最近一次生产发布（以 prod-* tag 为准）
#
# 用法：
#   scripts/release-status.sh
#   scripts/release-status.sh --project crm
#
# 为什么用 tag：表格会漂移，tag 跟着 commit 走，任何人 clone 后都能查。
# 打 tag：scripts/release-tag.sh <project> "说明" [--push]
set -uo pipefail

REPO=$(cd "$(dirname "$0")/.." && pwd)
cd "$REPO" || exit 1

ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    -p|--project) ONLY=${2:-}; shift 2 ;;
    -h|--help)    sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 64 ;;
  esac
done

PROJECTS="presence shixu crm qingliao-mini qingliao-mall"
[ -n "$ONLY" ] && PROJECTS=$ONLY

now=$(date +%s)
row() { # 显示名 tag
  local label="$1" tag="$2" commit ct days note flag
  if [ -z "$tag" ]; then
    printf '%-20s %-30s %-11s %-9s %s\n' "$label" "未记账" "-" "-" "scripts/release-tag.sh ${label%%/*} \"说明\""
    return
  fi
  commit=$(git rev-parse --short "$tag^{commit}" 2>/dev/null || echo "?")
  ct=$(git log -1 --format=%ct "$tag^{commit}" 2>/dev/null || echo "$now")
  days=$(( (now - ct) / 86400 ))
  note=$(git tag -l --format='%(contents:subject)' "$tag" | head -1)
  flag=""
  git merge-base --is-ancestor "$tag^{commit}" main 2>/dev/null || flag=" ⚠️不在 main 上"
  printf '%-20s %-30s %-11s %-9s %s%s\n' "$label" "$tag" "$commit" "${days}天" "$note" "$flag"
}
# tag 名自带 yyyymmdd-HHmm，一律按名字排序：补记的旧 tag 不会因为"创建时间新"排到最前面
printf '%-20s %-30s %-11s %-9s %s\n' 项目 "线上版本 tag" 提交 距今天 说明
printf '%-20s %-30s %-11s %-9s %s\n' -------------- ------------------------------ ----------- --------- ------

for p in $PROJECTS; do
  # 变体：prod-<project>-<变体>-<yyyymmdd-HHmm>，前后端分开发布时按产物分别记账
  vars=$(git tag -l "prod-$p-*" | sed -n "s/^prod-$p-\(.\{1,\}\)-[0-9]\{8\}-[0-9]\{4\}$/\1/p" | sort -u)
  if [ -n "$vars" ]; then
    for v in $vars; do
      row "$p/$v" "$(git tag -l "prod-$p-$v-*" --sort=-refname | head -1)"
    done
    base=$(git tag -l "prod-$p-*" | grep -E "^prod-$p-[0-9]{8}-[0-9]{4}$" | sort -r | head -1)
    [ -n "$base" ] && echo "  ↳ 另有未分变体的 $base（两个产物记在 tag message 里，已被上面按产物记的 tag 取代）"
  else
    row "$p" "$(git tag -l "prod-$p-*" --sort=-refname | head -1)"
  fi
done

echo ""
echo "全部生产 tag（新→旧，最多 10 条）："
# 按 tag 名里的时间戳排（跨项目也能对齐时间线）
git tag -l 'prod-*' | awk -F- '{print $(NF-1)"-"$NF"  "$0}' | sort -r | head -10 | sed 's/^[^ ]*  /  /'
if [ -z "$(git tag -l 'prod-*' | head -1)" ]; then echo "  （暂无）"; fi
exit 0