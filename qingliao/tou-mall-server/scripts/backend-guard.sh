#!/usr/bin/env bash
# 后端存活看护（建议 cron 每 2 分钟）+ 部署锁避让
#
# 背景：2026-11-13 20:54 一次中断的发布把测试环境后端停掉后没拉起，
# 全站 502 挂了 40 分钟，只有一小时一次的 brand-crm-watch.sh 报警。
# deploy-test.sh 已加 EXIT trap 自动回滚；本脚本兜住「脚本外被停掉」的情况
# （手工 kill、OOM、误操作、上次发布被 Ctrl-C 在 trap 之外打断）。
#
# 安全边界：
#   - $APP_DIR/.deploy.lock 存在（deploy-test.sh 正在发布）→ 不插手
#   - 有 mvn 在跑（服务器上就地打包）→ 不插手
#   - flock 保证本脚本不会并发启动两份
#   - 有 systemd unit 时只走 systemctl start（unit 的 ExecStartPre 会先清掉占端口的野进程），
#     没有 unit 才退回直接调 start-backend.sh；不改配置、不删日志、不回滚 jar
#
# 安装：
#   install -m 755 scripts/backend-guard.sh /opt/fullyu-mall-test/bin/backend-guard.sh
#   crontab -e  →  */2 * * * * /opt/fullyu-mall-test/bin/backend-guard.sh
# 日志：$APP_DIR/logs/backend-guard.log（超过 2MB 自动轮转一份 .1）
set -u

BASE=${BASE:-/opt/fullyu-mall-test}
START=${START:-$BASE/start-backend.sh}
LOG=${LOG:-$BASE/logs/backend-guard.log}
LOCK=${LOCK:-$BASE/.deploy.lock}
FLOCK=${FLOCK:-$BASE/.backend-guard.flock}
JAR_PATTERN='mall-admin-1\.0-SNAPSHOT\.jar'
UNIT=${UNIT:-mall-test}
HEALTH=${HEALTH:-http://127.0.0.1:19929/shop/authorized}
WAIT_SECONDS=${WAIT_SECONDS:-150}

ts() { date '+%F %T'; }
say() { echo "$(ts) $*" >>"$LOG"; }

# 日志限长，避免 cron 跑久了撑爆磁盘
if [ -f "$LOG" ] && [ "$(stat -c %s "$LOG")" -gt 2097152 ]; then
  mv -f "$LOG" "$LOG.1"
fi

# 并发保护：拿不到锁说明上一轮还没结束
exec 9>"$FLOCK"
if ! flock -n 9; then
  exit 0
fi

pids() { ps -C java -o pid=,args= | awk "/$JAR_PATTERN/ {print \$1}"; }

if [ -n "$(pids)" ]; then
  exit 0
fi

if [ -e "$LOCK" ]; then
  say "SKIP 部署进行中（$LOCK 存在），本轮不看护"
  exit 0
fi

if pgrep -x mvn >/dev/null 2>&1; then
  say "SKIP 检测到 mvn 在打包，本轮不看护"
  exit 0
fi

say "ALERT 后端未运行，开始拉起"
# 优先 systemctl：setsid 直接拉起的 JVM 不在 systemd 的 cgroup 里，systemctl restart 杀不掉，
# 会让后续发布卡在 PortInUse、服务一直跑旧包（2026-11-18 事故）。
started=0
if systemctl cat "$UNIT" >/dev/null 2>&1; then
  say "SYSTEMD systemctl start $UNIT（ExecStartPre 会先释放 19929）"
  if systemctl start "$UNIT" >>"$LOG" 2>&1; then
    started=1
  else
    say "WARN systemctl start $UNIT 失败，退回直接拉起 $START"
  fi
fi
if [ "$started" = 0 ]; then
  say "FALLBACK 直接拉起：$START"
  # 后台拉起，必须 setsid --fork 做二次 fork：
  #   - 直接 & 时 JVM 是本脚本的子进程，bash 退出要等它 → ssh/发布命令挂死、flock 一直被占
  #   - 9>&- 关掉 flock 的 fd，否则 JVM 继承后看护从此拿不到锁（2026-11-13 实测）
  ( cd "$BASE" && setsid --fork nohup ./"$(basename "$START")" >>"$LOG" 2>&1 </dev/null 9>&- & )
fi

for _ in $(seq 1 "$WAIT_SECONDS"); do
  sleep 1
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$HEALTH" 2>/dev/null || true)
  if [ "$code" = "200" ]; then
    pid=$(pids | head -1)
    tz=$(tr '\0' '\n' <"/proc/${pid:-0}/cmdline" 2>/dev/null | grep -c 'user.timezone=Asia/Shanghai')
    say "OK 已恢复（pid=${pid:-?}，${SECONDS}s，时区参数=${tz}）"
    exit 0
  fi
done

say "FAIL 拉起后 ${WAIT_SECONDS}s 内健康检查仍非 200，需人工介入：tail -50 $BASE/logs/app.log"
exit 1