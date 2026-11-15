#!/usr/bin/env bash
# 分支审计：对照 main 给每条分支定性，只删"已完全并入"的，其余给人工判断依据
#
# 用法：
#   scripts/branch-audit.sh                 # 只审计本地分支
#   scripts/branch-audit.sh --remote        # 连远端 origin/* 一起审计
#   scripts/branch-audit.sh --apply         # 删除已并入 main 的本地分支
#   scripts/branch-audit.sh --remote --apply
#   scripts/branch-audit.sh --stale-days 14
#
# 判定：
#   可删       ahead=0，已完全并入 main
#   旧快照     顶层是 apps/ 而不是 presence/（收口前的独立仓库布局），不能用于发布
#   过期       最后一次提交超过 --stale-days 天且仍有独有提交
#   活跃       其余
#
# 删除前想留后路：git bundle create ~/branches-$(date +%Y%m%d).bundle --all
set -uo pipefail

REPO=$(cd "$(dirname "$0")/.." && pwd)
cd "$REPO" || exit 1

REMOTE=0
APPLY=0
STALE_DAYS=30
PROTECT="main|master|HEAD"

while [ $# -gt 0 ]; do
  case "$1" in
    --remote)     REMOTE=1; shift ;;
    --apply)      APPLY=1; shift ;;
    --stale-days) STALE_DAYS=${2:-30}; shift 2 ;;
    -h|--help)    sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 64 ;;
  esac
done

git fetch -q --prune origin 2>/dev/null || echo "（无法 fetch，按本地已知状态审计）"

now=$(date +%s)
deleted=0
todo=0

classify() { # ref -> "判定|ahead|behind|days"
  local ref="$1" ahead behind ct days layout
  ahead=$(git rev-list --count "main..$ref" 2>/dev/null || echo "?")
  behind=$(git rev-list --count "$ref..main" 2>/dev/null || echo "?")
  ct=$(git log -1 --format=%ct "$ref" 2>/dev/null || echo "$now")
  days=$(( (now - ct) / 86400 ))
  layout=$(git ls-tree --name-only "$ref" 2>/dev/null | tr '\n' ' ')
  local verdict
  if [ "$ahead" = "0" ]; then
    verdict="可删"
  else
    case " $layout " in
      *" apps "*) if ! printf ' %s ' "$layout" | grep -q ' presence '; then verdict="旧快照"; fi ;;
    esac
  fi
  if [ -z "${verdict:-}" ]; then
    if [ "$days" -gt "$STALE_DAYS" ]; then verdict="过期"; else verdict="活跃"; fi
  fi
  printf '%s|%s|%s|%s\n' "$verdict" "$ahead" "$behind" "$days"
}

audit() { # label ref prefix
  local label="$1" ref="$2" prefix="$3"
  local name verdict ahead behind days
  name=${ref#"$prefix"}
  IFS='|' read -r verdict ahead behind days <<< "$(classify "$ref")"
  printf '  %-46s %-8s ahead %-4s behind %-4s %3s 天前\n' "$name" "$verdict" "$ahead" "$behind" "$days"
  case "$verdict" in
    可删)
      if [ "$APPLY" -eq 1 ]; then
        if [ "$prefix" = "origin/" ]; then
          git push origin --delete "$name" >/dev/null 2>&1 && { echo "        已删远端 $name"; deleted=$((deleted+1)); }
        else
          git branch -D "$name" >/dev/null 2>&1 && { echo "        已删本地 $name"; deleted=$((deleted+1)); }
        fi
      else
        todo=$((todo+1))
      fi
      ;;
    旧快照)
      echo "        旧布局快照：内容不可直接合回 main，确认已归档后删"
      todo=$((todo+1))
      ;;
    过期)
      echo "        有独有提交且 ${days} 天未动：确认是否已废弃"
      todo=$((todo+1))
      ;;
  esac
}

echo "分支审计 ｜ 对照 main ｜ 过期阈值 ${STALE_DAYS} 天"
echo ""
echo "本地分支："
local_branches=$(git for-each-ref --format='%(refname:short)' refs/heads | grep -Ev "^($PROTECT)$" || true)
if [ -z "$local_branches" ]; then
  echo "  （无）"
else
  for b in $local_branches; do audit "local" "$b" ""; done
fi

if [ "$REMOTE" -eq 1 ]; then
  echo ""
  echo "远端分支（origin/*）："
  remote_branches=$(git for-each-ref --format='%(refname:short)' refs/remotes/origin \
    | grep -Ev "^origin$|^origin/HEAD$|^origin/($PROTECT)$" || true)
  if [ -z "$remote_branches" ]; then
    echo "  （无）"
  else
    for b in $remote_branches; do audit "remote" "$b" "origin/"; done
  fi
fi

echo ""
if [ "$APPLY" -eq 1 ]; then
  echo "已删除 $deleted 条分支；其余 $todo 条需人工确认。"
else
  echo "待处理 $todo 条。确认后加 --apply 删除可删项；删前建议先 git bundle create ~/branches-$(date +%Y%m%d).bundle --all"
fi