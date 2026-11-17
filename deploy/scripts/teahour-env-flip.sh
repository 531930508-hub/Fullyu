#!/usr/bin/env bash
# 时叙 api.env 的 NODE_ENV 切换窗口脚本（批次 4 前置）
#
# 在 121.40（生产 teahour-api）/ 8.133（测试 teahour-test）上以 root 执行。
# 默认只看不动，写操作必须显式 --apply。
#
#   ./teahour-env-flip.sh preflight  [--profile prod|test]          采集现状 + 列出“切到 production 会改哪些行”
#   ./teahour-env-flip.sh plan       [--profile prod|test]          只生成拟用 env 并跑守卫预检，不安装、不重启
#   ./teahour-env-flip.sh apply      [--profile prod|test] --apply  备份 → 改写 → 守卫预检 → 安装 → 重启 → 验 health
#   ./teahour-env-flip.sh rollback   [--profile prod|test] --apply  恢复最近一次备份并重启
#
# 判定标准：http://127.0.0.1:<PORT>/api/health 返回 200。
# 守卫预检（teahour-guard-check.js check）不通过时**不重启**，线上进程保持原样；
# 重启后 120s 拿不到 200，脚本自己恢复备份再重启，并保留现场。
set -uo pipefail

MODE=${1:-preflight}
shift || true

PROFILE=prod
APPLY=0
ENV_OVERRIDE=""
PREV=""
for arg in "$@"; do
  case "$arg" in
    --profile|--env-file) PREV=$arg ;;
    prod|test)
      [ "$PREV" = "--profile" ] && PROFILE=$arg
      PREV="" ;;
    --apply) APPLY=1; PREV="" ;;
    *)
      if [ "$PREV" = "--env-file" ]; then ENV_OVERRIDE=$arg; PREV=""; else echo "未知参数：$arg"; exit 2; fi
      ;;
  esac
done

case "$PROFILE" in
  prod)
    ENV_FILE=/etc/teahour/api.env
    SERVICE=teahour-api
    PORT=18787
    APP_ROOT=/opt/teahour/app/apps/server
    ;;
  test)
    ENV_FILE=/etc/teahour-test/api.env
    SERVICE=teahour-test
    PORT=18788
    APP_ROOT=/opt/teahour-test/app/apps/server
    ;;
  *) echo "profile 只接受 prod / test"; exit 2 ;;
esac

NODE_BIN=/opt/node20/bin/node
[ -n "$ENV_OVERRIDE" ] && ENV_FILE=$ENV_OVERRIDE
HEALTH_URL=http://127.0.0.1:${PORT}/api/health
GUARD=/root/teahour-guard-check.js
BACKUP_DIR=/root/backups
TS=$(date +%Y%m%d-%H%M%S)
BASENAME=$(basename "$ENV_FILE")

say() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }
die() { say "失败：$*"; exit 1; }

health_code() { curl -s -o /dev/null -m 5 -w '%{http_code}' "$HEALTH_URL"; }
health_ok() { [ "$(health_code)" = "200" ]; }

wait_health() { # wait_health <秒>
  local deadline=$(( $(date +%s) + ${1:-120} ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    health_ok && return 0
    sleep 3
  done
  return 1
}

require_guard() {
  [ -f "$GUARD" ] || die "$GUARD 不存在（先把 teahour-guard-check.js 拷到 /root/）"
  [ -d "$APP_ROOT" ] || die "$APP_ROOT 不存在"
}

preflight() {
  require_guard
  mkdir -p "$BACKUP_DIR"
  local out="$BACKUP_DIR/teahour-preflight-$PROFILE-$TS.txt"
  local proposed="/tmp/teahour-env-proposed-$PROFILE-$TS.env"
  {
    echo "== 时间 $TS   profile=$PROFILE"
    echo "-- systemd 单元"
    systemctl is-active "$SERVICE"; systemctl is-enabled "$SERVICE"
    echo "-- 进程"
    ps -o user=,pid=,etime=,args= -p "$(systemctl show "$SERVICE" -p MainPID --value)" 2>/dev/null || echo "(无)"
    echo "-- env 文件"
    ls -l "$ENV_FILE"
    sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=\(.*\)$/\1 = \2/p' "$ENV_FILE" \
      | sed -E 's/(SECRET|KEY|PASSWORD|TOKEN|APPSECRET|DATABASE_URL|UKEY|SN)=.*/\1 = <已设>/'
    echo "-- 健康（现在）"; echo "HTTP $(health_code)"
    echo "-- 部署产物"
    ls -l --time-style=+%Y-%m-%d_%H:%M "$APP_ROOT/dist/main.js"
    echo "-- 现有守卫结论（照 env 原样）"
    "$NODE_BIN" "$GUARD" check "$ENV_FILE" "$APP_ROOT" || true
    echo "-- 切到 production 的拟改动"
    "$NODE_BIN" "$GUARD" rewrite "$ENV_FILE" "$proposed" production || true
    echo "-- 拟用 env 的守卫结论"
    "$NODE_BIN" "$GUARD" check "$proposed" "$APP_ROOT" || true
    rm -f "$proposed"
  } | tee "$out"
  say "已存证：$out"
}

plan() {
  require_guard
  local proposed="/tmp/teahour-env-proposed-$PROFILE-$TS.env"
  "$NODE_BIN" "$GUARD" rewrite "$ENV_FILE" "$proposed" production || die "改写失败"
  echo "---- 拟用 env 里非机密行 ----"
  sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=\(.*\)$/\1 = \2/p' "$proposed" \
    | sed -E 's/(SECRET|KEY|PASSWORD|TOKEN|APPSECRET|DATABASE_URL|UKEY|SN)=.*/\1 = <已设>/'
  echo "---- 守卫预检 ----"
  if "$NODE_BIN" "$GUARD" check "$proposed" "$APP_ROOT"; then
    say "预检通过（没有安装、没有重启）。拟用文件留在 $proposed"
  else
    rm -f "$proposed"
    die "预检不通过，不要切：先按上面的提示改 env"
  fi
}

apply_changes() {
  [ "$APPLY" = "1" ] || die "写操作必须显式加 --apply"
  require_guard
  local bk="$BACKUP_DIR/teahour-env-$PROFILE-$BASENAME-$TS.bak"
  local proposed="/tmp/teahour-env-proposed-$PROFILE-$TS.env"

  say "1/6 备份 $ENV_FILE -> $bk"
  cp -a "$ENV_FILE" "$bk" && chmod 600 "$bk" || die "备份失败"

  say "2/6 生成拟用 env"
  "$NODE_BIN" "$GUARD" rewrite "$ENV_FILE" "$proposed" production || die "改写失败（线上未动）"

  say "3/6 守卫预检（不通过就不重启）"
  if ! "$NODE_BIN" "$GUARD" check "$proposed" "$APP_ROOT"; then
    rm -f "$proposed"
    die "预检不通过，已中止；线上进程与 env 均未改动"
  fi

  say "4/6 安装 env（原 inode 追加写入，保留属主与权限）"
  cat "$proposed" > "$ENV_FILE" || die "写入失败，用 $bk 恢复"
  rm -f "$proposed"
  ls -l "$ENV_FILE"

  say "5/6 重启 $SERVICE"
  systemctl restart "$SERVICE"

  say "6/6 等 health 200（最多 120s）"
  if wait_health 120; then
    say "成功：health 200（HTTP $(health_code)）"
    say "回滚命令：$0 rollback --profile $PROFILE --apply（备份 $bk）"
    journalctl -u "$SERVICE" --since "-3min" --no-pager 2>/dev/null | grep -iE '\[config\]|ERROR' | tail -5 || true
    return 0
  fi

  say "health 未在 120s 内恢复，自动回滚"
  cat "$bk" > "$ENV_FILE"
  systemctl restart "$SERVICE"
  if wait_health 120; then
    die "已回滚并恢复 health 200；请查看 $bk 与 journalctl -u $SERVICE"
  fi
  die "回滚后仍无 health 200：人工介入（备份 $bk）"
}

rollback() {
  [ "$APPLY" = "1" ] || die "写操作必须显式加 --apply"
  local bk
  bk=$(ls -1t "$BACKUP_DIR"/teahour-env-"$PROFILE"-"$BASENAME"-*.bak 2>/dev/null | head -1)
  [ -n "$bk" ] || die "$BACKUP_DIR 里没有 $PROFILE 的 env 备份"
  say "恢复 $bk -> $ENV_FILE"
  cat "$bk" > "$ENV_FILE" || die "恢复失败"
  systemctl restart "$SERVICE"
  if wait_health 120; then
    say "回滚完成：health 200"
  else
    die "回滚后 health 仍不是 200，人工介入"
  fi
}

say "profile=$PROFILE  env=$ENV_FILE  service=$SERVICE  health=$HEALTH_URL"
case "$MODE" in
  preflight) preflight ;;
  plan) plan ;;
  apply) apply_changes ;;
  rollback) rollback ;;
  *) echo "用法：$0 preflight|plan|apply|rollback [--profile prod|test] [--apply]"; exit 2 ;;
esac