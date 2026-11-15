#!/usr/bin/env bash
# 发布前版本备份：把「这次要发布的东西」连同可回滚的上一版一起落到本地快照目录。
#
# 用途：每次发版前跑一次，出事故时用快照秒回，不必翻 git 找包。
# 与线上既有机制的关系：
#   - 服务器侧已有 deploy/backup/fu-backup-presence.sh（每日 DB + 配置 + 产物）
#   - H5 发版已有 full-yu-mini2/scripts/h5.mjs deploy（服务器端 backups/web-<ts>.tgz）
#   - 本脚本补的是「本机发布前」这一环：源码 + 构建产物 + 版本/commit 指纹，一次成型
#
# 用法：
#   scripts/pre-release-backup.sh -p presence -v 2.3.0
#   scripts/pre-release-backup.sh -p qingliao-mini -v 1.0.18
#   scripts/pre-release-backup.sh -p presence -d presence/apps/admin/dist -n "课程页头布局"
#   scripts/pre-release-backup.sh list
#
# 产物结构：$FULLYU_RELEASES/<project>/<时间戳>-v<版本>/
#   source.tar.gz   源码（git archive；非 git 工程则排除 node_modules/unpackage/dist）
#   dist-*.tar.gz   构建产物（真正上传/部署的那个目录，原样打包）
#   dists.txt       产物归档 ↔ 原始路径 对照
#   dirty.patch     未提交改动（仅工作区不干净时，保证备份与当时磁盘一致）
#   manifest.json   版本、commit、分支、appid、产物 sha256
#   ROLLBACK.md     可照抄的回滚步骤
set -euo pipefail

REPO=$(cd "$(dirname "$0")/.." && pwd)
ROOT=${FULLYU_RELEASES:-$HOME/Desktop/_releases}
PROJECT=""
SRC=""
VERSION=""
NOTE=""
KEEP=10
DISTS=()

die() { echo "错误: $*" >&2; exit 1; }
say() { echo "  $*"; }

usage() { sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }
sha256() { shasum -a 256 "$1" 2>/dev/null | cut -d' ' -f1; }

apply_defaults() {
  case "$PROJECT" in
    presence)
      SRC=${SRC:-$REPO/presence}
      if [ ${#DISTS[@]} -eq 0 ]; then DISTS=("$SRC/apps/admin/dist" "$SRC/apps/miniprogram/dist"); fi
      ;;
    shixu)   SRC=${SRC:-$REPO/shixu} ;;
    crm)     SRC=${SRC:-$REPO/crm} ;;
    qingliao-mini)
      SRC=${SRC:-$HOME/Desktop/Full愈-轻疗/full-yu-mini2}
      if [ ${#DISTS[@]} -eq 0 ]; then DISTS=("$SRC/unpackage/dist/build/mp-weixin"); fi
      ;;
    qingliao-mall) SRC=${SRC:-$REPO/qingliao/tou-mall-server} ;;
    *) die "未知项目: ${PROJECT}（可选 presence|shixu|crm|qingliao-mini|qingliao-mall）" ;;
  esac
  [ -d "$SRC" ] || die "源码目录不存在: $SRC"
}

cmd_list() {
  [ -d "$ROOT" ] || { echo "还没有任何快照（$ROOT 不存在）"; return 0; }
  printf "%-15s %-24s %-9s %-8s %s\n" 项目 快照 版本 commit 说明
  for p in $(ls -1 "$ROOT" 2>/dev/null); do
    for d in $(ls -1 "$ROOT/$p" 2>/dev/null | sort -r); do
      m="$ROOT/$p/$d/manifest.json"
      v=$(sed -n 's/.*"version": "\(.*\)",/\1/p' "$m" 2>/dev/null | head -1)
      c=$(sed -n 's/.*"commit": "\(.*\)",/\1/p' "$m" 2>/dev/null | head -1)
      n=$(sed -n 's/.*"note": "\(.*\)",/\1/p' "$m" 2>/dev/null | head -1)
      printf "%-15s %-24s %-9s %-8s %s\n" "$p" "$d" "${v:--}" "${c:--}" "${n:--}"
    done
  done
}

cmd_backup() {
  apply_defaults
  local ts name dir
  ts=$(date '+%Y%m%d-%H%M%S')
  name=$ts
  [ -n "$VERSION" ] && name="$ts-v$VERSION"
  dir="$ROOT/$PROJECT/$name"
  mkdir -p "$dir"

  # 1) git 指纹
  local commit="-" branch="-" dirty=0 isgit=0
  if git -C "$SRC" rev-parse --git-dir >/dev/null 2>&1; then
    isgit=1
    commit=$(git -C "$SRC" rev-parse --short HEAD)
    branch=$(git -C "$SRC" rev-parse --abbrev-ref HEAD)
    dirty=$(git -C "$SRC" status --porcelain | wc -l | tr -d ' ')
    if [ "$dirty" -gt 0 ]; then
      git -C "$SRC" diff HEAD > "$dir/dirty.patch" || true
      say "注意：工作区有 $dirty 个未提交改动 → dirty.patch"
    fi
  fi

  # 2) 源码
  if [ "$isgit" -eq 1 ]; then
    git -C "$SRC" archive --format=tar.gz -o "$dir/source.tar.gz" HEAD
  else
    tar czf "$dir/source.tar.gz" -C "$SRC" \
      --exclude=node_modules --exclude=unpackage --exclude=.git --exclude=dist . 2>/dev/null
  fi

  # 3) 构建产物
  : > "$dir/dists.txt"
  local found=0 d bn
  if [ ${#DISTS[@]} -gt 0 ]; then
    for d in "${DISTS[@]}"; do
      if [ -d "$d" ]; then
        bn="dist-$(echo "${d#$SRC/}" | tr '/' '-').tar.gz"
        tar czf "$dir/$bn" -C "$d" .
        printf '%s\t%s\n' "$bn" "$d" >> "$dir/dists.txt"
        found=$((found+1))
        say "产物: $d → $bn ($(du -h "$dir/$bn" | cut -f1))"
      else
        say "跳过（不存在）: $d"
      fi
    done
  fi
  [ "$found" -eq 0 ] && say "本次只备份源码，没有产物目录"

  # 4) appid 记账（轻疗 manifest 旧 appid 的坑）
  local appid="-"
  if [ -f "$SRC/project.config.json" ] && grep -q '"appid"' "$SRC/project.config.json"; then
    appid=$(grep -m1 '"appid"' "$SRC/project.config.json" | sed 's/.*: *"\(.*\)".*/\1/')
  fi

  # 5) manifest.json
  {
    echo "{"
    echo "  \"project\": \"$PROJECT\","
    echo "  \"snapshot\": \"$name\","
    echo "  \"created_at\": \"$(date '+%Y-%m-%d %H:%M:%S %z')\","
    echo "  \"host\": \"$(hostname -s)\","
    echo "  \"version\": \"${VERSION:-未指定}\","
    echo "  \"note\": \"$NOTE\","
    echo "  \"source_dir\": \"$SRC\","
    echo "  \"branch\": \"$branch\","
    echo "  \"commit\": \"$commit\","
    echo "  \"dirty_files\": $dirty,"
    echo "  \"appid\": \"$appid\","
    if [ -s "$dir/dists.txt" ]; then
      echo "  \"artifacts\": ["
      local first=1 a orig size sha
      while IFS=$'\t' read -r a orig; do
        size=$(stat -f%z "$dir/$a" 2>/dev/null || echo 0); sha=$(sha256 "$dir/$a")
        [ $first -eq 1 ] || echo ","
        first=0
        printf '    {"archive": "%s", "original_path": "%s", "bytes": %s, "sha256": "%s"}' "$a" "$orig" "$size" "$sha"
      done < "$dir/dists.txt"
      echo ""
      echo "  ]"
    else
      echo "  \"artifacts\": []"
    fi
    echo "}"
  } > "$dir/manifest.json"

  # 6) ROLLBACK.md
  {
    echo "# 回滚说明 — $PROJECT / $name"
    echo
    echo "- 快照时间：$(date '+%F %T')"
    echo "- 版本：${VERSION:-未指定}"
    if [ "$isgit" -eq 1 ]; then
      echo "- 源码：${SRC}（$branch @ ${commit}，未提交 $dirty 个文件）"
    else
      echo "- 源码：${SRC}（非 git 工程，按文件快照，未跟踪为 0 基线）"
    fi
    echo "- appid：$appid"
    echo
    echo "## 目录内容"
    echo '```'
    ls -1 "$dir"
    echo '```'
    echo
    case "$PROJECT" in
      qingliao-mini)
        echo "## 小程序回滚"
        echo '```bash'
        echo "# 1) 解出旧产物"
        echo "mkdir -p /tmp/rollback-$name && tar xzf $dir/$(head -1 "$dir/dists.txt" | cut -f1) -C /tmp/rollback-$name"
        echo "# 2) 开发者工具打开 /tmp/rollback-${name}，或用 CLI 上传（版本号建议 +1）"
        echo "cli upload --project /tmp/rollback-$name --version <回滚版本号> --desc 'rollback $name'"
        echo "# 3) 公众平台设为体验版 / 提交审核"
        echo '```'
        echo "appid 以 project.config.json 为准（当前 ${appid}），上传前确认不是旧号。"
        ;;
      qingliao-mall)
        echo "## 轻疗商城回滚"
        echo '```bash'
        echo "# 换回服务器上保留的上一版 jar：停服务 → 替换 jar → 启动（必须带 -Duser.timezone=Asia/Shanghai，端口 19929）"
        echo '```'
        ;;
      *)
        echo "## 回滚"
        echo '```bash'
        echo "# 代码回退"
        echo "git -C $SRC fetch --all && git -C $SRC checkout $commit"
        if [ -s "$dir/dists.txt" ]; then
          echo "# 产物回退"
          while IFS=$'\t' read -r a orig; do echo "tar xzf $dir/$a -C $orig"; done < "$dir/dists.txt"
        fi
        echo "# 数据库：ECS 上用 deploy/backup 的每日快照还原"
        echo '```'
        echo "走 CI 的话，直接把上一版 commit 重新触发 workflow 最稳（源码与产物同源）。"
        ;;
    esac
    echo
    echo "## 其他版本"
    echo "scripts/pre-release-backup.sh list"
  } > "$dir/ROLLBACK.md"

  # 7) 保留策略：超过 KEEP 份时删最旧
  local all n
  all=$(ls -1 "$ROOT/$PROJECT" | sort)
  n=$(echo "$all" | wc -l | tr -d ' ')
  if [ "$n" -gt "$KEEP" ]; then
    echo "$all" | head -n $((n - KEEP)) | while read -r old; do
      [ -n "$old" ] && rm -rf "$ROOT/$PROJECT/$old" && say "清理旧快照: $old"
    done
  fi

  echo
  echo "备份完成：$dir"
  echo "  源码 $(du -h "$dir/source.tar.gz" | cut -f1)｜产物 $found 个｜合计 $(du -sh "$dir" | cut -f1)"
  echo "  回滚步骤：$dir/ROLLBACK.md"
  echo "  全部快照：$0 list"
}

# 第一个参数可以是子命令，也可以直接是选项（默认 backup）
if [ $# -gt 0 ]; then
  case "$1" in
    -h|--help) usage ;;
    list) cmd_list; exit 0 ;;
    backup) shift ;;
    -*) : ;;                                   # 选项开头 → 走默认 backup
    *) die "未知命令: $1（可用 backup | list）" ;;
  esac
fi

while [ $# -gt 0 ]; do
  case "$1" in
    -p|--project) PROJECT=${2:-}; shift 2 ;;
    -s|--src)     SRC=${2:-};     shift 2 ;;
    -v|--version) VERSION=${2:-}; shift 2 ;;
    -n|--note)    NOTE=${2:-};    shift 2 ;;
    -d|--dist)    DISTS+=("${2:-}"); shift 2 ;;
    -k|--keep)    KEEP=${2:-10};  shift 2 ;;
    -h|--help)    usage ;;
    *) die "未知参数: $1（-h 看用法）" ;;
  esac
done

[ -n "$PROJECT" ] || die "必须指定 -p <项目>（-h 看用法）"
cmd_backup