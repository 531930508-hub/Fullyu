#!/usr/bin/env bash
# 配置驱动的机器巡检（生成于 2026-11-16，批次 0.3；当前用于 8.133 与 121.40）
#   在场（120.55）仍用同目录 fu-health-check.sh（hardcode pm2/端口），两者共用
#   /etc/fullyu-alert.conf 的 ALERT_WEBHOOK_URL / ALERT_WEBHOOK_TYPE 约定；
#   批次 3 做双机时再把在场那台迁到本脚本，避免维护两份。
# Full愈 服务器巡检（生产方案-最终版 批次 0.3）
#   只读：不改配置、不重启进程、不删日志。
#   依赖：curl；配置在 /etc/fullyu/health-checks.conf（name|type|value|expect）
#   告警：ALERT_WEBHOOK_URL（企业微信机器人）已配才发，未配只写日志（批次 0.7 补齐）
#   去抖：只在状态翻转时告警（OK→FAIL 发"故障"，FAIL→OK 发"已恢复"），每 5 分钟跑一次。
#   用法：fu-health-check.sh [--test]
#          --test 强制把每条检查的当前结果打印出来，并（若配了 webhook）发一条测试消息
set -uo pipefail

CONF=${CONF:-/etc/fullyu/health-checks.conf}
LOG=${LOG:-/var/log/fu-health.log}
STATE_DIR=${STATE_DIR:-/var/lib/fu-health/state}
# 与在场 deploy/monitor/fu-health-check.sh 共用告警配置约定
ALERT_CONF=${ALERT_CONF:-/etc/fullyu-alert.conf}
[ -f "$ALERT_CONF" ] && . "$ALERT_CONF"
WEBHOOK=${ALERT_WEBHOOK_URL:-$(cat /etc/fullyu/alert-webhook 2>/dev/null || true)}
WEBHOOK_TYPE=${ALERT_WEBHOOK_TYPE:-wecom}
HOST=$(hostname -s)
TEST=0
[ "${1:-}" = "--test" ] && TEST=1

mkdir -p "$STATE_DIR" 2>/dev/null
exec 9>/var/lock/fu-health-check.lock
flock -n 9 || exit 0

# 非 --test 模式（cron）写日志文件；--test 直接打到终端
if [ "$TEST" = 0 ]; then
  exec >>"$LOG" 2>&1
fi

ts() { date '+%F %T'; }
say() { echo "$(ts) [$HOST] $*"; }

send_alert() { # $1=标题 $2=内容
  [ -z "$WEBHOOK" ] && { say "WOULD_ALERT $1 :: $2"; return 0; }
  local text payload
  text=$(printf '[%s] %s\n%s' "$HOST" "$1" "$2")
  case "$WEBHOOK_TYPE" in
    feishu)   payload=$(printf '{"msg_type":"text","content":{"text":"%s"}}' "$(printf '%s' "$text" | sed 's/"/\\"/g' | tr '\n' ' ')") ;;
    dingtalk) payload=$(printf '{"msgtype":"text","text":{"content":"%s"}}' "$(printf '%s' "$text" | sed 's/"/\\"/g' | tr '\n' ' ')") ;;
    *)        payload=$(printf '{"msgtype":"text","text":{"content":"%s"}}' "$(printf '%s' "$text" | sed 's/"/\\"/g' | tr '\n' ' ')") ;;
  esac
  curl -s -o /dev/null --max-time 8 -H 'Content-Type: application/json' -d "$payload" "$WEBHOOK" \
    && say "ALERT_SENT $1" || say "ALERT_FAIL $1"
}

alert_check() { # $1=name $2=fail(0/1) $3=detail
  local name=$1 bad=$2 detail=$3 sf="$STATE_DIR/$name"
  local prev=OK
  [ -f "$sf" ] && prev=$(cat "$sf")
  if [ "$bad" = 0 ]; then
    echo OK > "$sf"
    if [ "$prev" = FAIL ]; then
      say "RECOVERED $name :: $detail"
      send_alert "已恢复：$name" "$detail"
    else
      say "OK $name :: $detail"
    fi
  else
    echo FAIL > "$sf"
    if [ "$prev" = FAIL ]; then
      say "STILL_BAD $name :: $detail"
    else
      say "FAIL $name :: $detail"
      send_alert "故障：$name" "$detail"
    fi
    return 1
  fi
}

fail=0
[ -f "$CONF" ] || { say "FATAL 缺少配置 $CONF"; exit 2; }

while IFS='|' read -r name type value expect; do
  case "$name" in ''|\#*) continue ;; esac
  case "$type" in
    http)
      code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 6 "$value" 2>/dev/null) || true
      [ -z "$code" ] && code=000
      if [ "$code" = "${expect:-200}" ]; then
        alert_check "$name" 0 "HTTP $code $value" || fail=1
      else
        alert_check "$name" 1 "HTTP $code（期望 ${expect:-200}）$value" || fail=1
      fi
      ;;
    tcp)
      host=${value%%:*}; port=${value##*:}
      if timeout 5 bash -c "echo >/dev/tcp/$host/$port" 2>/dev/null; then
        alert_check "$name" 0 "TCP $value 可连" || fail=1
      else
        alert_check "$name" 1 "TCP $value 不通" || fail=1
      fi
      ;;
    proc)
      n=$(pgrep -fc "$value" 2>/dev/null || echo 0)
      if [ "$n" -ge "${expect:-1}" ]; then
        alert_check "$name" 0 "进程数 $n >= $expect（$value）" || fail=1
      else
        alert_check "$name" 1 "进程数 $n < $expect（$value）" || fail=1
      fi
      ;;
    disk)
      use=$(df -P "$value" | awk 'NR==2{gsub("%","",$5); print $5}')
      if [ "${use:-100}" -le "${expect:-90}" ]; then
        alert_check "$name" 0 "磁盘 ${use}% <= ${expect:-90}%（$value）" || fail=1
      else
        alert_check "$name" 1 "磁盘 ${use}% > ${expect:-90}%（$value）" || fail=1
      fi
      ;;
    *) say "SKIP 未知类型 $type（$name）" ;;
  esac
done < "$CONF"

if [ "$TEST" = 1 ]; then
  say "TEST_MODE 完成，异常 $fail 条；webhook $([ -n "$WEBHOOK" ] && echo 已配 || echo 未配)"
  [ -n "$WEBHOOK" ] && send_alert "测试告警" "这是 $HOST 的巡检测试消息，收到即通道正常。"
fi

exit $([ "$fail" = 0 ] && echo 0 || echo 1)