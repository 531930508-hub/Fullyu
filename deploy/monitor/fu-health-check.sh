#!/usr/bin/env bash
# 在场健康巡检（0.9 的"机器级"部分：进程 / 站点 / 磁盘 / 证书）
# 用法：fu-health-check.sh [--test]
#   --test  立即发一条测试告警（用来验证 webhook 通不通）
# 依赖：/etc/fullyu-alert.conf（可选，600）
#   ALERT_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx
#   ALERT_WEBHOOK_TYPE=wecom        # wecom | dingtalk | feishu
# 未配置 webhook 时只写本地日志（/var/log/fu-health.log），故障仍然留痕。
# 去重：同一类告警 30 分钟内只发一次，恢复时发一条"已恢复"。
set -uo pipefail

CONF=/etc/fullyu-alert.conf
LOG=/var/log/fu-health.log
STATE=/var/lib/fu-health.state
mkdir -p "$(dirname "$STATE")" 2>/dev/null || true
touch "$LOG" 2>/dev/null || LOG=/dev/null

ALERT_WEBHOOK_URL=${ALERT_WEBHOOK_URL:-}
ALERT_WEBHOOK_TYPE=${ALERT_WEBHOOK_TYPE:-wecom}
[ -f "$CONF" ] && . "$CONF"

log() { echo "$(date '+%F %T') $*" >>"$LOG"; }

send() { # send <text>
  local text=$1
  if [ -z "$ALERT_WEBHOOK_URL" ]; then log "[未配置 webhook] $text"; return 0; fi
  local body
  case "$ALERT_WEBHOOK_TYPE" in
    feishu) body=$(printf '{"msg_type":"text","content":{"text":"%s"}}' "$(esc "$text")") ;;
    *)      body=$(printf '{"msgtype":"text","text":{"content":"%s"},"at":{"isAtAll":false}}' "$(esc "$text")") ;;
  esac
  curl -sS -m 5 -H 'Content-Type: application/json' -d "$body" "$ALERT_WEBHOOK_URL" >/dev/null 2>&1 \
    || log "告警发送失败：$text"
}

esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' '|'; }

alert() { # alert <key> <text>
  local key=$1 text=$2 now last
  now=$(date +%s); last=$(grep -s "^$key=" "$STATE" | cut -d= -f2); last=${last:-0}
  if [ $((now - last)) -ge 1800 ]; then
    send "【Full愈·$(hostname)】$text"
    grep -v "^$key=" "$STATE" >"$STATE.tmp" 2>/dev/null; echo "$key=$now" >>"$STATE.tmp"; mv "$STATE.tmp" "$STATE"
    log "ALERT $text"
  else
    log "抑制重复告警 $text"
  fi
}

recover() { # recover <key> <text>
  if grep -q "^$1=" "$STATE" 2>/dev/null; then
    send "【Full愈·$(hostname)】已恢复：$2"
    grep -v "^$1=" "$STATE" >"$STATE.tmp"; mv "$STATE.tmp" "$STATE"
    log "RECOVER $2"
  fi
}

if [ "${1:-}" = "--test" ]; then
  send "【Full愈·$(hostname)】测试告警：收到说明通道正常 $(date '+%F %T')"
  echo "已尝试发送测试告警（未配置 webhook 时只会写 $LOG）"
  exit 0
fi

fail=0

# 1) 后端进程 + 健康接口
# pm2 pid 查不到进程时会输出空或 0，两种都算不在
pid=$(pm2 pid fullyu-api 2>/dev/null | tr -d '[:space:]')
if [ -n "$pid" ] && [ "$pid" != "0" ]; then
  recover pm2 "fullyu-api 进程在线"
else
  alert pm2 "fullyu-api 进程不在（pm2 里查不到 pid），站点可能已 502"; fail=1
fi
code=$(curl -sS -o /dev/null -m 8 -w '%{http_code}' http://127.0.0.1:3000/api/v1/health 2>/dev/null)
if [ "$code" = "200" ]; then recover api "后端健康接口恢复 200"
else alert api "后端健康接口返回 ${code:-无响应}"; fail=1; fi

# 2) 前台三处站点（admin 8080、H5 走本机 80、主站 80）
for pair in "admin:8080" "site:80"; do
  name=${pair%%:*}; port=${pair##*:}
  c=$(curl -sS -o /dev/null -m 8 -w '%{http_code}' "http://127.0.0.1:$port/" 2>/dev/null)
  if [ "$c" = "200" ]; then recover "web_$name" "$name 站点恢复 200"
  else alert "web_$name" "$name 站点（:$port）返回 ${c:-无响应}"; fail=1; fi
done

# 3) 磁盘
usage=$(df --output=pcent / 2>/dev/null | tail -1 | tr -dc '0-9')
if [ -n "$usage" ] && [ "$usage" -ge 85 ]; then alert disk "根分区已用 ${usage}%（阈值 85%），请清理日志/备份"; fail=1
else recover disk "根分区使用率回到正常"; fi

# 4) 证书剩余天数（<21 天告警，给续期留出修复时间）
# 只查 nginx 真正引用的证书：目录里的孤儿文件（比如换域名后没删的旧 pem）不该天天报警
certs=$(grep -rhoE 'ssl_certificate[[:space:]]+[^;]+' /etc/nginx 2>/dev/null \
  | awk '{print $2}' | sed 's#"##g' | sort -u)
for cert in $certs; do
  [ -f "$cert" ] || continue
  end=$(openssl x509 -in "$cert" -noout -enddate 2>/dev/null | cut -d= -f2)
  [ -n "$end" ] || continue
  days=$(( ( $(date -d "$end" +%s) - $(date +%s) ) / 86400 ))
  key="cert_$(basename "$cert")"
  if [ "$days" -lt 21 ]; then alert "$key" "证书 $cert 仅剩 $days 天到期"; fail=1
  else recover "$key" "证书 $cert 有效期回到正常（$days 天）"; fi
done

log "巡检完成 fail=$fail"
exit "$fail"