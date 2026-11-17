#!/usr/bin/env bash
# 轻疗（mall-admin）夜间窗口脚本 —— 在 120.55 上以 root 执行
#
# 只在打烊后跑；默认只看不动，任何写操作都要显式加 --apply。
#   ./qingliao-window.sh preflight          采集现状（进程/健康/redis 客户端/jar 哈希/磁盘），落 /root/backups
#   ./qingliao-window.sh install-unit --apply   把 nohup 起的进程换成 systemd 托管（可 rollback）
#   ./qingliao-window.sh rollback --apply       退回 nohup 方式，恢复 start-120.sh
#
# 判定标准只有一个：http://127.0.0.1:9929/actuator/health 返回 {"status":"UP"}。
# 任何一步之后 120s 内拿不到 UP，脚本自己回滚并保留现场。
set -uo pipefail

JAR_DIR=/server/java/fully
JAR=mall-admin-1.0-SNAPSHOT.jar
UNIT_NAME=mall-admin.service
UNIT_SRC=/root/${UNIT_NAME}
UNIT_DST=/etc/systemd/system/${UNIT_NAME}
HEALTH_URL=http://127.0.0.1:9929/actuator/health
BACKUP_DIR=/root/backups
TS=$(date +%Y%m%d-%H%M%S)

say() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }
die() { say "失败：$*"; exit 1; }

health_ok() {
  curl -s -m 5 "$HEALTH_URL" | grep -q '"status":"UP"'
}

wait_health() { # wait_health <秒>
  local deadline=$(( $(date +%s) + ${1:-120} ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    health_ok && return 0
    sleep 3
  done
  return 1
}

preflight() {
  mkdir -p "$BACKUP_DIR"
  local out="$BACKUP_DIR/qingliao-preflight-$TS.txt"
  {
    echo "== 时间 $TS"
    echo "-- 进程"
    local p; p=$(pgrep -f "$JAR" | head -1)
    if [ -n "$p" ]; then ps -o user=,pid=,etime=,args= -p "$p"; else echo "(未运行)"; fi
    echo "-- 进程数"; pgrep -fc "$JAR" || echo 0
    echo "-- systemd 单元"
    systemctl cat "$UNIT_NAME" 2>/dev/null | head -3 || true
    echo "-- 健康"; curl -s -m 5 "$HEALTH_URL" || echo "(无响应)"; echo
    echo "-- 监听 9929"; ss -lntp | grep 9929
    echo "-- jar"; sha256sum "$JAR_DIR/$JAR"
    echo "-- start-120.sh sha"; sha256sum "$JAR_DIR/start-120.sh"
    echo "-- 磁盘"; df -h / | tail -1
    echo "-- 内存"; free -m | head -2
    echo "-- 47.111 redis 客户端（从本机看）"; ss -tn | grep '47.111.136.49:6379' | wc -l
  } | tee "$out"
  say "已存证：$out"
}

install_unit() {
  [ "${1:-}" = "--apply" ] || die "只做了检查；确认要切换到 systemd 请加 --apply"
  [ -f "$UNIT_SRC" ] || die "先把 qingliao-mall-admin.service 传到 $UNIT_SRC"
  preflight

  # 1) 留好回退点
  cp -a "$JAR_DIR/start-120.sh" "$BACKUP_DIR/start-120.sh.$TS"
  [ -f "$UNIT_DST" ] && cp -a "$UNIT_DST" "$BACKUP_DIR/$UNIT_NAME.$TS"

  # 2) 装单元
  install -m 0644 "$UNIT_SRC" "$UNIT_DST"
  systemctl daemon-reload
  systemctl enable "$UNIT_NAME" >/dev/null 2>&1 || say "enable 失败（不影响本次启动）"

  # 3) 停掉 nohup 进程（SIGTERM 让 Spring 收连接池）
  local pid
  pid=$(pgrep -f "$JAR" | head -1)
  if [ -n "$pid" ]; then
    say "停止旧进程 $pid"
    kill -TERM "$pid" 2>/dev/null
    for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 3; done
    kill -0 "$pid" 2>/dev/null && { say "优雅退出超时，SIGKILL"; kill -9 "$pid"; sleep 2; }
  fi

  # 4) 启动并验收
  systemctl start "$UNIT_NAME"
  if wait_health 120; then
    say "切换成功：systemctl status $UNIT_NAME"
    systemctl --no-pager --lines=0 status "$UNIT_NAME" | head -5
  else
    say "健康检查未通过，自动回滚"
    rollback --apply
  fi
}

rollback() {
  [ "${1:-}" = "--apply" ] || die "回滚需加 --apply"
  systemctl stop "$UNIT_NAME" 2>/dev/null
  systemctl disable "$UNIT_NAME" >/dev/null 2>&1
  rm -f "$UNIT_DST"
  systemctl daemon-reload
  pkill -f "$JAR" 2>/dev/null
  sleep 3
  say "用原脚本拉起"
  bash "$JAR_DIR/start-120.sh"
  if wait_health 120; then
    say "已回滚到 nohup 方式，健康正常"
  else
    say "！！！回滚后仍然不健康，人工介入：/server/java/fully/logs/ 最新日志"
    exit 1
  fi
}

case "${1:-}" in
  preflight)   preflight ;;
  install-unit) shift; install_unit "${1:-}" ;;
  rollback)    shift; rollback "${1:-}" ;;
  *) echo "用法：$0 {preflight|install-unit --apply|rollback --apply}"; exit 2 ;;
esac