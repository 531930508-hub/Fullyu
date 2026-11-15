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
printf '%-14s %-30s %-11s %-9s %s\n' 项目 "线上版本 tag" 提交 距今天 说明
printf '%-14s %-30s %-11s %-9s %s\n' -------------- ------------------------------ ----------- --------- ------

for p in $PROJECTS; do
  tag=$(git tag -l "prod-$p-*" --sort=-creatordate | head -1)
  if [ -z "$tag" ]; then
    printf '%-14s %-30s %-11s %-9s %s\n' "$p" "未记账" "-" "-" "跑 scripts/release-tag.sh $p \"说明\""
    continue
  fi
  commit=$(git rev-parse --short "$tag^{commit}" 2>/dev/null || echo "?")
  ct=$(git log -1 --format=%ct "$tag^{commit}" 2>/dev/null || echo "$now")
  days=$(( (now - ct) / 86400 ))
  note=$(git tag -l --format='%(contents:subject)' "$tag" | head -1)
  flag=""
  if ! git merge-base --is-ancestor "$tag^{commit}" main 2>/dev/null; then
    flag=" ⚠️不在 main 上"
  fi
  printf '%-14s %-30s %-11s %-9s %s%s\n' "$p" "$tag" "$commit" "${days}天" "$note" "$flag"
done

echo ""
echo "全部生产 tag（新→旧，最多 10 条）："
git tag -l 'prod-*' --sort=-creatordate | head -10 | sed 's/^/  /'
if [ -z "$(git tag -l 'prod-*' | head -1)" ]; then echo "  （暂无）"; fi
exit 0