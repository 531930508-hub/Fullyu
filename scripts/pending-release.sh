#!/usr/bin/env bash
# 待发布清单：一条命令看清「哪些提交还没合进 main」和「生产现在跑的是哪个 commit」
#
# 用法：
#   scripts/pending-release.sh                 # 默认：本地分支 + 线上（生产）回读
#   scripts/pending-release.sh --remote        # 连 origin/* 一起看（推荐每周跑一次）
#   scripts/pending-release.sh --offline       # 只做 git 侧，不发起任何网络请求
#   scripts/pending-release.sh --strict        # 有风险时退出码 1（给发布门禁用）
#   scripts/pending-release.sh --stale-days 1  # 超过几天算"漂了"（默认 2）
#   scripts/pending-release.sh --commits 5     # 每条分支最多列几条独有提交（默认 3，0=全部）
#
# 为什么需要它：发布只认 main，分支不合并 = 下一次从 main 发布就把它"覆盖"掉
# （11-20 两次回退、11-21 测试发布被覆盖，都是这个模型）。所以发布前要同时回答两件事：
#   1) 有没有提交只在分支上、不在 main 里？
#   2) 线上产物对应哪个 commit，它在不在 main 里？
#
# 只读保证：git 只读（fetch 除外，不碰工作区/不改 ref 内容）、curl 只发 GET、
# ssh 只跑 ls/date/ps/python3 读文件，不上传、不重启、不写任何服务器文件。
# 判定口径与脚本分工见 docs/deploy/发布与分支规范.md §8。
#   分支配性 → scripts/branch-audit.sh ｜ tag 账本 → scripts/release-status.sh

set -uo pipefail

REPO=$(cd "$(dirname "$0")/.." && pwd)
cd "$REPO" || exit 1

REMOTE=0
OFFLINE=0
STRICT=0
STALE_DAYS=2
PER_BRANCH=3

while [ $# -gt 0 ]; do
  case "$1" in
    --remote)     REMOTE=1; shift ;;
    --offline)    OFFLINE=1; shift ;;
    --strict)     STRICT=1; shift ;;
    --stale-days) STALE_DAYS=${2:-2}; shift 2 ;;
    --commits)    PER_BRANCH=${2:-3}; shift 2 ;;
    -h|--help)    sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 64 ;;
  esac
done

FETCH_NOTE=""
if [ "$OFFLINE" -eq 1 ]; then
  FETCH_NOTE="（--offline：不 fetch、不访问服务器，按本地已知 origin/main 判定）"
else
  git fetch -q --prune origin main 2>/dev/null || FETCH_NOTE="（git fetch 失败，按本地已知 origin/main 判定）"
fi

MAIN=origin/main
git rev-parse --verify -q "$MAIN" >/dev/null 2>&1 || MAIN=main
if ! git rev-parse --verify -q "$MAIN" >/dev/null 2>&1; then
  echo "找不到 origin/main 或 main，无法判定" >&2
  exit 1
fi
MAIN_SHA=$(git rev-parse "$MAIN")
MAIN_SHORT=$(git rev-parse --short "$MAIN")

tmp_branches=$(mktemp)
tmp_rows=$(mktemp)
trap 'rm -f "$tmp_branches" "$tmp_rows"' EXIT
ISSUES=0
HOT=""
DRIFT=""

# ---------- 1. 未合入 main 的分支提交 ----------

labels_of_paths() { # stdin: 路径列表 → "presence,qingliao-mall,CI"
  local out=""
  local paths
  paths=$(cat)
  printf '%s\n' "$paths" | grep -q '^presence/'     && out="$out presence"
  printf '%s\n' "$paths" | grep -q '^shixu/'        && out="$out shixu"
  printf '%s\n' "$paths" | grep -q '^crm/'          && out="$out crm"
  printf '%s\n' "$paths" | grep -q '^qingliao/apps/miniprogram/'          && out="$out qingliao-mini"
  printf '%s\n' "$paths" | grep -q '^qingliao/tou-mall-server/\|^qingliao/tou-mall-admin-web/' && out="$out qingliao-mall"
  printf '%s\n' "$paths" | grep -q '^qingliao/'     && out="$out qingliao-其他"
  printf '%s\n' "$paths" | grep -q '^\.github/'     && out="$out CI"
  printf '%s\n' "$paths" | grep -q '^deploy/\|^scripts/' && out="$out 运维"
  printf '%s\n' "$paths" | grep -q '^docs/\|^README\|^AGENTS' && out="$out 文档"
  out=${out# }
  [ -z "$out" ] && out="其他"
  printf '%s' "$out" | tr ' ' ','
}

deployable() { # "presence,CI,文档" → 是否触碰发布单元
  case ",$1," in
    *,presence,*|*,shixu,*|*,crm,*|*,qingliao-mini,*|*,qingliao-mall,*|*,CI,*) return 0 ;;
    *) return 1 ;;
  esac
}

{
  git for-each-ref --format='%(refname)%09%(refname:short)%09%(objectname)%09local'  refs/heads
  if [ "$REMOTE" -eq 1 ]; then
    git for-each-ref --format='%(refname)%09%(refname:short)%09%(objectname)%09remote' refs/remotes/origin
  fi
} > "$tmp_branches"

now=$(date +%s)
seen=""
while IFS=$'\t' read -r ref short sha kind; do
  [ -z "${ref:-}" ] && continue
  case "$kind" in
    remote)
      short=${short#origin/}
      [ "$short" = "HEAD" ] && continue
      label="远端"
      ;;
    *) label="本地" ;;
  esac
  case "$short" in main|master) continue ;; esac
  key="$short/$sha"
  case " $seen " in *" $key "*) continue ;; esac
  seen="$seen $key"

  # 用 git cherry 判"内容是否已在 main"：同一改动被 cherry-pick/rebase 成另一个 sha 时，
  # 光看 rev-list 会误报成"没合"，这里按 patch 等价性判，'-' 表示已被 main 覆盖
  cherry=$(git cherry "$MAIN" "$ref" 2>/dev/null)
  missing_shas=$(printf '%s\n' "$cherry" | sed -n 's/^+ //p')
  missing=$(printf '%s\n' "$missing_shas" | grep -c . || true)
  dup=$(printf '%s\n' "$cherry" | sed -n 's/^- //p' | grep -c . || true)
  [ "${missing:-0}" -eq 0 ] && continue
  behind=$(git rev-list --count "$ref..$MAIN" 2>/dev/null || echo 0)

  oldest_ct=""
  oldest_sha=""
  oldest_subj=""
  paths=""
  n=0
  for s in $missing_shas; do
    n=$((n+1))
    [ "$n" -gt 100 ] && break
    line=$(git log -1 --format='%ct%x09%h%x09%s' "$s" 2>/dev/null)
    ct=$(printf '%s' "$line" | cut -f1)
    if [ -z "$oldest_ct" ] || [ "$ct" -lt "$oldest_ct" ]; then
      oldest_ct=$ct
      oldest_sha=$(printf '%s' "$line" | cut -f2)
      oldest_subj=$(printf '%s' "$line" | cut -f3-)
    fi
    paths="$paths$(git show --name-only --format= "$s" 2>/dev/null)"$'\n'
  done
  days=$(( (now - ${oldest_ct:-$now}) / 86400 ))
  labels=$(printf '%s\n' "$paths" | grep -v '^$' | sort -u | labels_of_paths)

  layout=""
  if git ls-tree --name-only "$ref" 2>/dev/null | grep -qx 'apps' && \
     ! git ls-tree --name-only "$ref" 2>/dev/null | grep -qx 'presence'; then
    layout="旧快照"
  fi
  # read 会吞掉连续 IFS 制表符造成的空字段，用 - 占位
  [ -z "$layout" ] && layout="-"

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$oldest_ct" "$short" "$label" "$missing" "$behind" "$days" "$labels" \
    "$oldest_sha" "$oldest_subj" "$layout" "$ref" >> "$tmp_rows"
done < "$tmp_branches"

echo "待发布清单 ｜ base = $MAIN ($MAIN_SHORT) ｜ $(date '+%Y-%m-%d %H:%M') ｜ 只读 $FETCH_NOTE"
echo ""
echo "一、没合进 main 的分支提交（最久未合的排在前面）"
echo ""

if [ ! -s "$tmp_rows" ]; then
  echo "  （无：所有分支都已并入 main）"
else
  echo "  格式：分支名 · 位置 ｜ 未合条数 · 落后 main 条数 · 最老未合提交（天）"
  echo ""
  while IFS=$'\t' read -r ct short label ahead behind days labels oldest_sha oldest_subj layout ref; do
    mark=""
    [ "$days" -gt "$STALE_DAYS" ] && mark="⏰"
    if deployable "$labels"; then mark="${mark}🔥"; ISSUES=$((ISSUES+1)); fi
    [ "$layout" != "-" ] && mark="${mark}[$layout]"
    [ -n "$mark" ] && mark="$mark "
    printf '  %s%s  ·  %s\n' "$mark" "$short" "$label"
    printf '      未合 %s 条 · 落后 main %s 条 · 最老未合提交 %s 天\n' "$ahead" "$behind" "$days"
    printf '      触达：%s    （最老一条：%s）\n' "$labels" "$oldest_subj"
    if [ "$PER_BRANCH" -gt 0 ]; then
      git cherry "$MAIN" "$ref" 2>/dev/null | sed -n 's/^+ //p' \
        | awk '{a[NR]=$0} END{for(i=NR;i>=1;i--) print a[i]}' | head -n "$PER_BRANCH" \
        | while IFS= read -r s; do
            echo "      └ $(git log -1 --format='%h %ad %s' --date=format:'%m-%d %H:%M' "$s" 2>/dev/null)"
          done
      [ "$ahead" -gt "$PER_BRANCH" ] && echo "      └ …另有 $((ahead - PER_BRANCH)) 条"
    fi
  done < <(sort -n "$tmp_rows")
  echo ""
  echo "  图例：⏰ = 最老未合提交超过 ${STALE_DAYS} 天　🔥 = 触碰可发布目录（合入 main 即进入发布候选）"
fi

# ---------- 2. 线上当前 commit（只读回读） ----------

echo ""
echo "二、生产线上当前 commit"
echo ""

tag_commit() { # project [变体] → short sha of newest prod tag（先找变体家族，再回落基础家族）
  local p="$1" v="${2:-}" t=""
  [ -n "$v" ] && t=$(git tag -l "prod-$p-$v-*" --sort=-refname | head -1)
  [ -z "$t" ] && t=$(git tag -l "prod-$p-*" --sort=-refname | head -1)
  [ -z "$t" ] && { echo ""; return; }
  git rev-parse --short "$t^{commit}" 2>/dev/null
}

verdict_of() { # project sha [变体] → 判定文字
  local p="$1" s="$2" v="${3:-}" ts tsha
  [ -z "$s" ] && { echo "无标记可读"; return; }
  if ! git cat-file -e "${s}^{commit}" >/dev/null 2>&1; then echo "⚠️ 本地无该提交"; return; fi
  if ! git merge-base --is-ancestor "$s" "$MAIN" 2>/dev/null; then
    echo "🔴 不在 main（下次从 main 发布即覆盖）"; return
  fi
  tsha=$(tag_commit "$p" "$v")
  if [ -z "$tsha" ]; then echo "未记账"; return; fi
  if [ "$(git rev-parse "$s")" != "$(git rev-parse "$tsha^{commit}")" ]; then
    echo "🟡 与最新 tag 不一致（$tsha）"; return
  fi
  local paths=""
  case "$p:$v" in
    qingliao-mall:web) paths="qingliao/tou-mall-admin-web/" ;;
    qingliao-mall:api) paths="qingliao/tou-mall-server/" ;;
  esac
  if [ -n "$paths" ]; then
    behind=$(git rev-list --count "$s..$MAIN" -- $paths 2>/dev/null || echo 0)
  else
    behind=$(git rev-list --count "$s..$MAIN" 2>/dev/null || echo 0)
  fi
  if [ "$behind" -gt 0 ]; then echo "一致（main 另有 $behind 条待发布提交）"; else echo "一致"; fi
}

report_row() { # 单元 来源(ASCII) 线上commit 线上时间 判定
  local unit="$1" src="$2" sha="$3" at="$4" v="$5" val
  if [ -z "$sha" ]; then
    val="—"
    [ "$OFFLINE" -eq 1 ] && val="未取（--offline）"
  else
    val="$sha"
  fi
  [ -n "$at" ] && val="$val  $at"
  printf '  %-22s %-26s %-44s %s\n' "$unit" "$src" "$val" "$v"
  case "$v" in
    🔴*) ISSUES=$((ISSUES+1)); HOT="${HOT:-} $unit:$sha" ;;
    🟡*) ISSUES=$((ISSUES+1)); DRIFT="${DRIFT:-} $unit" ;;
  esac
}

echo "  单元                   回读来源                 线上 commit / 时间                       判定"

# 轻疗商城前端：产物自带 /static/build-info.json，直接 GET
MALL_FRONT_SHA=""
MALL_FRONT_TIME=""
if [ "$OFFLINE" -eq 0 ] && command -v curl >/dev/null 2>&1; then
  bi=$(curl -fsS --max-time 8 https://cityretreat.fullyu.cn/static/build-info.json 2>/dev/null || true)
  MALL_FRONT_SHA=$(printf '%s' "$bi" | sed -n 's/.*"commit"[[:space:]]*:[[:space:]]*"\([0-9a-f]\{7,40\}\)".*/\1/p' | head -1)
  MALL_FRONT_TIME=$(printf '%s' "$bi" | sed -n 's/.*"builtAt"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
fi
report_row "qingliao-mall front" "build-info.json (GET)" "$MALL_FRONT_SHA" "$MALL_FRONT_TIME" "$(verdict_of qingliao-mall "$MALL_FRONT_SHA" web)"

# 轻疗商城后端 jar：MANIFEST 的 Implementation-Build（120.55 无 unzip，用 python3 读 zip）
MALL_JAR_SHA=""
MALL_JAR_TIME=""
PRESENCE_TIME=""
if [ "$OFFLINE" -eq 0 ]; then
  out120=$(ssh -o BatchMode=yes -o ConnectTimeout=6 -o StrictHostKeyChecking=accept-new root@120.55.36.3 bash -s 2>/dev/null <<'REMOTE'
J=$(ps -C java -o args= 2>/dev/null | grep -oE '/[^ ]*mall-admin[^ ]*\.jar' | head -1)
[ -n "${J:-}" ] || J=$(ps -C java -o args= 2>/dev/null | grep -oE '/[^ ]+\.jar' | head -1)
[ -n "${J:-}" ] || J=$(ls -t /server/java/fully/mall-admin-*.jar 2>/dev/null | head -1)
if [ -n "${J:-}" ] && command -v python3 >/dev/null 2>&1; then
python3 - "$J" <<'PY'
import sys, zipfile
try:
    man = zipfile.ZipFile(sys.argv[1]).read("META-INF/MANIFEST.MF").decode("utf-8", "replace")
except Exception as e:
    print("MALL_COMMIT_ERR=%s" % e); raise SystemExit
for line in man.splitlines():
    if line.startswith("Implementation-Build:"):
        print("MALL_COMMIT=" + line.split(":", 1)[1].strip()); break
else:
    print("MALL_COMMIT_ERR=MANIFEST 无 Implementation-Build")
PY
fi
echo "MALL_JAR_TIME=$(date -r "${J:-/nonexistent}" '+%Y-%m-%d %H:%M' 2>/dev/null)"
echo "PRESENCE_TIME=$(date -r /opt/fullyu/apps/admin/dist/index.html '+%Y-%m-%d %H:%M' 2>/dev/null)"
REMOTE
)
  MALL_JAR_SHA=$(printf '%s\n' "$out120" | sed -n 's/^MALL_COMMIT=//p' | head -1)
  MALL_JAR_TIME=$(printf '%s\n' "$out120" | sed -n 's/^MALL_JAR_TIME=//p' | head -1)
  PRESENCE_TIME=$(printf '%s\n' "$out120" | sed -n 's/^PRESENCE_TIME=//p' | head -1)
fi
report_row "qingliao-mall back" "jar MANIFEST (ssh)" "$MALL_JAR_SHA" "$MALL_JAR_TIME" "$(verdict_of qingliao-mall "$MALL_JAR_SHA" api)"

# 在场：产物无 commit 标记，只能读改动时间（缺口见规范 §10）
report_row "presence" "mtime (ssh)" "" "$PRESENCE_TIME" "仅时间，无法判定 commit"

# 时叙 / CRM：121.40，读各自 dist 里最新文件的 mtime
SHIXU_TIME=""
CRM_TIME=""
if [ "$OFFLINE" -eq 0 ]; then
  out121=$(ssh -o BatchMode=yes -o ConnectTimeout=6 -o StrictHostKeyChecking=accept-new root@121.40.119.57 bash -s 2>/dev/null <<'REMOTE'
newest() { find "$1" -type f -printf '%TY-%Tm-%Td %TH:%TM\n' 2>/dev/null | sort | tail -1; }
echo "SHIXU_TIME=$(newest /opt/teahour/app/apps/admin/dist)"
echo "CRM_TIME=$(newest /opt/fullyu-crm/apps/server/dist)"
REMOTE
)
  SHIXU_TIME=$(printf '%s\n' "$out121" | sed -n 's/^SHIXU_TIME=//p' | head -1)
  CRM_TIME=$(printf '%s\n' "$out121" | sed -n 's/^CRM_TIME=//p' | head -1)
fi
report_row "shixu" "mtime (ssh)" "" "$SHIXU_TIME" "仅时间，无法判定 commit"
report_row "crm" "mtime (ssh)" "" "$CRM_TIME" "仅时间，无法判定 commit"
report_row "qingliao-mini" "wx console (manual)" "" "" "需人工核对（脚本读不到）"

# ---------- 3. 结论 ----------

echo ""
echo "三、结论"

branches_with_pending=$(sort -u "$tmp_rows" 2>/dev/null | wc -l | tr -d ' ')
pending_commits=$(while IFS=$'\t' read -r ct short label ahead behind days labels sha8 subj layout ref; do echo "$ahead"; done < "$tmp_rows" | awk '{s+=$1} END{print s+0}')
stale=$(awk -F'\t' -v d="$STALE_DAYS" '$6>d' "$tmp_rows" 2>/dev/null | wc -l | tr -d ' ')

echo "  · 未合 main：${pending_commits:-0} 条提交，分布在 ${branches_with_pending:-0} 条分支（最老未合提交超过 ${STALE_DAYS} 天：${stale:-0} 条分支）"

if [ -n "${DRIFT:-}" ]; then
  echo "  · 🟡 记账滞后：${DRIFT# } 的线上 commit 与最新 prod tag 不一致（补 tag：scripts/release-tag.sh <project> \"说明\"）"
  echo "      注：轻疗商城前端/后端分开发布、共用一个 tag 家族，一个 tag 只能记一个 commit；判定以「是否在 main」为准"
fi
if [ -z "${HOT:-}" ]; then
  echo "  · 线上 commit 与 main 的关系：可回读的单元都在 main 上（其余单元无标记，见上表）"
else
  echo "  · 🔴 线上有 main 没有的提交：${HOT# }"
  for s in $HOT; do
    c=${s##*:}
    echo "      包含该提交的分支：$(git branch -a --contains "$c" 2>/dev/null | tr -d ' *' | tr '\n' ' ' | cut -c1-120)"
  done
  echo "      下一步：把那条分支合进 main（git merge --ff-only），再按 §3 G1/G2 重新发布；不要用别的分支产物去「补」"
fi

if [ "${pending_commits:-0}" -gt 0 ] 2>/dev/null; then
  echo "  · 提醒：以上未合 main 的提交，只要含可发布目录（🔥），下一次从 main 发布就会把它们覆盖——要么尽快合 main，要么明确记为废弃"
fi
echo "  · 合入模板：git switch main && git pull --ff-only && git merge --ff-only <分支> && git push origin main"

if [ "$STRICT" -eq 1 ] && [ "$ISSUES" -gt 0 ]; then
  echo ""
  echo "  ✗ --strict：发现 $ISSUES 处风险（未合的可发布提交 / 线上不在 main / 记账漂移）"
  exit 1
fi
exit 0