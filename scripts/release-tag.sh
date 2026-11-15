#!/usr/bin/env bash
# 生产发布记账：在 main 上打 annotated tag，记录"这个 commit 已上线"
#
# 用法：
#   scripts/release-tag.sh presence "课程页头两行布局"
#   scripts/release-tag.sh presence "..." --push      # 同时推到远端
#
# 前置条件（脚本会逐条检查，不满足就退出）：
#   1. 当前在 main
#   2. 已跟踪文件全部提交（工作区干净）
#   3. HEAD 与 origin/main 一致
# 约定：prod-<project>-<yyyymmdd-HHmm>；测试环境用 test-<project>-...
set -uo pipefail

REPO=$(cd "$(dirname "$0")/.." && pwd)
cd "$REPO" || exit 1

PROJECTS="presence shixu crm qingliao-mini qingliao-mall"
PROJECT=${1:-}
NOTE=${2:-}
PUSH=0

[ "${3:-}" = "--push" ] && PUSH=1

die() { echo "错误: $*" >&2; exit 1; }

[ -n "$PROJECT" ] || { sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 64; }
case " $PROJECTS " in
  *" $PROJECT "*) ;;
  *) die "未知项目: $PROJECT（可用：$PROJECTS）" ;;
esac
[ -n "$NOTE" ] || die "必须附一句说明，如：scripts/release-tag.sh $PROJECT \"修订单列表分页\""

[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || die "只能在 main 上记账（当前：$(git rev-parse --abbrev-ref HEAD)）"
[ -z "$(git status --porcelain --untracked-files=no)" ] || die "工作区有未提交改动，先提交再记账"

git fetch -q origin main 2>/dev/null || echo "（无法 fetch，跳过与 origin/main 的一致性检查）"
head=$(git rev-parse HEAD)
origin_head=$(git rev-parse origin/main 2>/dev/null || echo "$head")
[ "$head" = "$origin_head" ] || die "HEAD($(git rev-parse --short HEAD)) 与 origin/main($(git rev-parse --short origin/main)) 不一致，先 push"

tag="prod-$PROJECT-$(date +%Y%m%d-%H%M)"
if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  die "tag $tag 已存在（同一分钟重复发布？）等一分钟或手工指定"
fi

git tag -a "$tag" -m "prod $PROJECT @ $(git rev-parse --short HEAD)" \
  -m "时间：$(date '+%F %T')" \
  -m "说明：$NOTE" \
  -m "回滚：见 docs/deploy/发布与分支规范.md §2（产物 tarball / 上一版 commit）"

echo "已记账：$tag"
echo "  commit : $(git rev-parse --short HEAD) $(git log -1 --format=%s | cut -c1-60)"
echo "  说明   : $NOTE"
if [ "$PUSH" -eq 1 ]; then
  git push origin "refs/tags/$tag" && echo "  已推送 tag 到 origin"
else
  echo "  未推送。要共享账本：git push origin refs/tags/$tag"
fi
echo ""
echo "核对：scripts/release-status.sh --project $PROJECT"