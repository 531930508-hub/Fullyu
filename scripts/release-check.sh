#!/usr/bin/env bash
# G0 本地发布门禁：分支名 / 工作区 / 与 origin/main 的同步 / 按项目构建（+可选单测）
#
# 用法：
#   scripts/release-check.sh --project presence
#   scripts/release-check.sh --project shixu --full        # 额外跑单测
#   scripts/release-check.sh --project all --skip-build    # 只做 git 卫生检查
#   scripts/release-check.sh --project all --allow-dirty   # 明知有未提交改动仍继续
#   scripts/release-check.sh --list                        # 看项目矩阵
#
# 退出码：0 全绿（警告不影响）；1 有失败项；64 参数错误
# 说明：本脚本只读本地 + 构建，不碰服务器。构建失败即视为不合格，不允许"合了再修"。
set -uo pipefail

REPO=$(cd "$(dirname "$0")/.." && pwd)
cd "$REPO" || exit 1

PROJECT=""
FULL=0
SKIP_BUILD=0
ALLOW_DIRTY=0
OKN=0
ERR=0
WARN=0

usage() { sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; }

pass() { printf '  [OK]   %s\n' "$*"; OKN=$((OKN + 1)); }
fail() { printf '  [FAIL] %s\n' "$*"; ERR=$((ERR + 1)); }
warn() { printf '  [WARN] %s\n' "$*"; WARN=$((WARN + 1)); }
say()  { printf '%s\n' "$*"; }

PROJECTS="presence shixu crm qingliao-mini qingliao-mall"

list_matrix() {
  say "发布单元            目录                                   门禁命令"
  say "presence            presence/                              shared→prisma→server→admin→h5→vue-tsc"
  say "shixu               shixu/                                 server→admin（--full 加单测）"
  say "crm                 crm/                                   server（--full 加单测）"
  say "qingliao-mini       qingliao/apps/miniprogram/             build:mp（微信产物）"
  say "qingliao-mall       qingliao/tou-mall-server,+admin-web    手工：本机无 mvn/JDK8，走清单核对"
}

project_dirs() {
  case "$1" in
    presence)      echo "presence/" ;;
    shixu)         echo "shixu/" ;;
    crm)           echo "crm/" ;;
    qingliao-mini) echo "qingliao/apps/miniprogram/" ;;
    qingliao-mall) echo "qingliao/tou-mall-server/ qingliao/tou-mall-admin-web/" ;;
  esac
}

dir_of() {
  case "$1" in
    presence)      echo "presence" ;;
    shixu)         echo "shixu" ;;
    crm)           echo "crm" ;;
    qingliao-mini) echo "qingliao/apps/miniprogram" ;;
    qingliao-mall) echo "qingliao/tou-mall-server" ;;
  esac
}

run() {
  local dir="$1" label="$2"
  shift 2
  printf '  ....   %-44s' "$label"
  local t0=$SECONDS out rc
  out=$( cd "$REPO/$dir" && "$@" 2>&1 )
  rc=$?
  if [ $rc -eq 0 ]; then
    printf '\r  [OK]   %-44s %ds\n' "$label" $((SECONDS - t0))
    OKN=$((OKN + 1))
  else
    printf '\r  [FAIL] %-44s %ds\n' "$label" $((SECONDS - t0))
    printf '%s\n' "$out" | tail -30 | sed 's/^/         /'
    ERR=$((ERR + 1))
  fi
  return $rc
}

need_deps() {
  local dir="$1"
  if [ ! -d "$REPO/$dir/node_modules" ]; then
    say "  ($dir 缺少 node_modules，先安装依赖)"
    run "$dir" "pnpm install --frozen-lockfile" pnpm install --frozen-lockfile
  fi
}

# ---------- git 卫生 ----------
check_git() {
  say "── Git 卫生 ──"

  local branch
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")
  if [ "$branch" = "main" ]; then
    pass "分支 main（可发布）"
  elif printf '%s' "$branch" | grep -Eq '^(feat|fix|chore|docs|hotfix)/[a-z0-9][a-z0-9._-]*-[0-9]{8}$'; then
    pass "分支名合规：$branch"
  else
    warn "分支名不合规：$branch（期望 feat/fix/chore/docs/hotfix + /scope-yyyymmdd，或 main）"
  fi

  if git fetch -q origin main 2>/dev/null; then
    local behind ahead
    behind=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
    ahead=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
    if [ "$branch" = "main" ]; then
      [ "$behind" -eq 0 ] && pass "main 与 origin/main 同步" || fail "main 落后 origin/main $behind 个提交，先 git pull --ff-only"
      [ "$ahead" -eq 0 ] || warn "main 有 $ahead 个提交未推送"
    else
      if [ "$behind" -gt 50 ]; then
        fail "分支落后 origin/main $behind 个提交，像历史快照；请基于 main 重建分支再发布"
      elif [ "$behind" -gt 0 ]; then
        warn "分支落后 origin/main $behind 个提交，建议先合入或 rebase"
      else
        pass "分支不落后 origin/main"
      fi
    fi
  else
    warn "无法 fetch origin/main（离线或凭据问题），跳过同步检查"
  fi

  local dirty untracked
  dirty=$(git status --porcelain --untracked-files=no)
  untracked=$(git status --porcelain --untracked-files=normal | grep -c '^??' || true)
  [ "${untracked:-0}" -gt 0 ] && warn "有 $untracked 个未跟踪文件（不影响门禁，提交前确认不是产物）"

  if [ -z "$dirty" ]; then
    pass "工作区干净（已跟踪文件无改动）"
    return
  fi

  say "  未提交改动："
  printf '%s\n' "$dirty" | sed 's/^/         /'

  local p d inproj=0
  for p in $TARGETS; do
    for d in $(project_dirs "$p"); do
      if printf '%s\n' "$dirty" | grep -q " $d"; then inproj=1; fi
    done
  done

  if [ "$inproj" -eq 1 ]; then
    if [ "$ALLOW_DIRTY" -eq 1 ]; then
      warn "本次项目目录内有未提交改动（--allow-dirty，产物不可复现，部署后务必补提交）"
    else
      fail "本次项目目录内有未提交改动；构建产物与 git 不一致。提交或 stash 后重跑，或显式 --allow-dirty"
    fi
  else
    warn "其他目录有他人未提交改动（不在本次发布范围内），合 main 时不要带上"
  fi
}

# ---------- 各项目门禁 ----------
build_presence() {
  local d=presence
  need_deps "$d"
  run "$d" "shared build" pnpm --filter @fullyu/shared build
  run "$d" "prisma generate" pnpm --filter @fullyu/server db:generate
  run "$d" "server build" pnpm --filter @fullyu/server build
  run "$d" "admin build（含 vue-tsc）" pnpm --filter @fullyu/admin build
  run "$d" "H5 build" pnpm --filter @fullyu/miniprogram build:h5
  run "$d" "miniprogram type-check" pnpm --filter @fullyu/miniprogram exec vue-tsc --noEmit -p tsconfig.json
}

build_shixu() {
  local d=shixu
  need_deps "$d"
  run "$d" "server build" pnpm --filter @teahour/server build
  run "$d" "admin build" pnpm --filter @teahour/admin build
  [ "$FULL" -eq 1 ] && run "$d" "server tests" pnpm test
  return 0
}

build_crm() {
  local d=crm
  need_deps "$d"
  run "$d" "server build" pnpm build:server
  [ "$FULL" -eq 1 ] && run "$d" "server tests" pnpm test
  return 0
}

build_qingliao_mini() {
  local d=qingliao/apps/miniprogram
  need_deps "$d"
  run "$d" "mp-weixin build" pnpm build:mp
}

build_qingliao_mall() {
  say "  [手工] 本机无 mvn/JDK8，构建在服务器或专用机器执行。核对清单："
  say "         1) 后端 jar 用 -Duser.timezone=Asia/Shanghai 启动，端口 19929"
  say "         2) 环境变量来自 /etc/fullyu/qingliao-mall.env，部署不覆盖"
  say "         3) admin-web 是静态产物，覆盖前用 deploy/scripts/backup-dist.sh 备份"
  say "         4) 探针：curl -s -o /dev/null -w '%{http_code}' https://cityretreat.fullyu.cn/"
  WARN=$((WARN + 1))
}

probe_hint() {
  say "── 部署后探针（发布前先记一次，部署后再记一次）──"
  case "$1" in
    presence)      say "  curl -s -o /dev/null -w 'presence %{http_code}\\n' https://presence.fullyu.cn/api/v1/health"
                   say "  curl -s -o /dev/null -w 'admin    %{http_code}\\n' https://presence.fullyu.cn/admin/" ;;
    shixu)         say "  curl -s -o /dev/null -w 'teahour  %{http_code}\\n' https://teahour.fullyu.cn/api/health" ;;
    crm)           say "  curl -s -o /dev/null -w 'crm      %{http_code}\\n' https://crm.fullyu.cn/api/health" ;;
    qingliao-mini) say "  微信开发者工具确认体验版版本号已变；提审前核对 appid" ;;
    qingliao-mall) say "  curl -s -o /dev/null -w 'mall     %{http_code}\\n' https://cityretreat.fullyu.cn/" ;;
  esac
}

# ---------- 主流程 ----------
while [ $# -gt 0 ]; do
  case "$1" in
    -p|--project)  PROJECT=${2:-}; shift 2 ;;
    --full)        FULL=1; shift ;;
    --skip-build)  SKIP_BUILD=1; shift ;;
    --allow-dirty) ALLOW_DIRTY=1; shift ;;
    --list)        list_matrix; exit 0 ;;
    -h|--help)     usage; exit 0 ;;
    *) echo "未知参数: $1（-h 看用法）" >&2; exit 64 ;;
  esac
done

if [ -z "$PROJECT" ]; then
  usage
  exit 64
fi

if [ "$PROJECT" = "all" ]; then
  TARGETS=$PROJECTS
else
  TARGETS=$PROJECT
  for p in $TARGETS; do
    case "$p" in
      presence|shixu|crm|qingliao-mini|qingliao-mall) ;;
      *) echo "未知项目: $p（可用：$PROJECTS all）" >&2; exit 64 ;;
    esac
  done
fi

say "Full愈 发布门禁 G0 ｜ 仓库 $(basename "$REPO") ｜ 项目：$TARGETS"
say ""
check_git

if [ "$SKIP_BUILD" -eq 0 ]; then
  for p in $TARGETS; do
    say ""
    say "── 构建门禁：$p ──"
    case "$p" in
      presence)      build_presence ;;
      shixu)         build_shixu ;;
      crm)           build_crm ;;
      qingliao-mini) build_qingliao_mini ;;
      qingliao-mall) build_qingliao_mall ;;
    esac
  done
fi

say ""
for p in $TARGETS; do probe_hint "$p"; done

say ""
if [ "$ERR" -gt 0 ]; then
  say "❌ 不合格：$ERR 项失败、$WARN 项警告、$OKN 项通过 —— 修完再合 main"
  exit 1
fi

say "✅ 门禁通过：$OKN 项通过、$WARN 项警告"
say ""
say "下一步（G1 Git 门）："
say "  git switch main && git pull --ff-only"
say "  git merge --ff-only <你的分支>"
say "  git push origin main"
say "  git rev-list --count origin/main..main     # 必须是 0"
say ""
say "部署完成后记账（G2）："
say "  scripts/release-tag.sh <${TARGETS%% *}> \"一句话说明\" --push"
exit 0