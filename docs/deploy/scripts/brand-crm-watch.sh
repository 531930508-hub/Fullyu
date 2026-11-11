#!/usr/bin/env bash
# 轻疗 → CRM 品牌订单上报 & 时区巡检（建议每小时跑）
# 部署位置：/opt/fullyu-mall-test/bin/brand-crm-watch.sh，输出 /opt/fullyu-mall-test/logs/brand-crm-watch.log
# 能抓：进程没了 / JVM 丢了 -Duser.timezone / 上报失败 / CRM 隧道断 / crm.env 缺项导致上报静默关闭
# 抓不到：CRM 侧 occurredAt 的实际偏移 —— 那要靠人工抽查（见文档 checklist）
set -u

BASE=${BASE:-/opt/fullyu-mall-test}
APP_LOG=${APP_LOG:-$BASE/logs/app.log}
OUT=${OUT:-$BASE/logs/brand-crm-watch.log}
ENVF=${ENVF:-$BASE/crm.env}
PROBE=${PROBE:-https://mall-test.fullyu.cn/crm-api/api/external/members/1}

since=$(date -d '-1 hour' '+%F %H:%M:%S')
now=$(date '+%F %T')
alerts=()

# 取真正的 java 进程：pgrep -f 会先匹配到启动它的 shell，必须按第二列过滤
pid=$(pgrep -a -f 'mall-admin-1.0-SNAPSHOT.jar' 2>/dev/null | awk '$2 ~ /java$/ {print $1; exit}')
if [ -z "${pid:-}" ]; then
  alerts+=("轻疗进程不存在")
else
  cmd=$(tr '\0' ' ' < "/proc/$pid/cmdline")
  case "$cmd" in
    *-Duser.timezone=Asia/Shanghai*) ;;
    *) alerts+=("JVM 缺少 -Duser.timezone=Asia/Shanghai（其余 now() 会歪）") ;;
  esac
fi

win=$(awk -v s="$since" '$0 >= s' "$APP_LOG" 2>/dev/null)
errs=$(printf '%s\n' "$win" | grep -c '品牌会员订单上报失败')
[ "${errs:-0}" -gt 0 ] && alerts+=("近1小时上报异常日志 ${errs} 条")

fails=$(printf '%s\n' "$win" | grep -o '品牌会员订单上报：.*失败 [0-9]*' | grep -o '[0-9]*$' \
        | awk '{t += $1} END {print t + 0}')
[ "${fails:-0}" -gt 0 ] && alerts+=("近1小时上报失败累计 ${fails} 笔")

reports=$(printf '%s\n' "$win" | grep -o '品牌会员订单上报：新增 [0-9]*' | grep -o '[0-9]*$' \
          | awk '{t += $1} END {print t + 0}')

code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$PROBE" 2>/dev/null)
case "$code" in
  401|403) ;;
  *) alerts+=("CRM 隧道不通（HTTP ${code:-000}，正常应为 401）") ;;
esac

miss=""
for k in BRAND_CRM_ENABLED BRAND_CRM_BASE_URL BRAND_CRM_KEY_ID BRAND_CRM_SECRET; do
  v=$(grep -E "^${k}=" "$ENVF" 2>/dev/null | tail -1 | cut -d= -f2-)
  [ -z "$v" ] && miss="$miss $k"
done
[ -n "$miss" ] && alerts+=("crm.env 缺项:${miss}（上报会静默关闭）")

line="$now reports=$reports fails=$fails errs=$errs tunnel=$code pid=${pid:-none}"
if [ ${#alerts[@]} -eq 0 ]; then
  printf 'OK    %s\n' "$line" >> "$OUT"
else
  joined=$(IFS='; '; printf '%s' "${alerts[*]}")
  printf 'ALERT %s :: %s\n' "$line" "$joined" >> "$OUT"
fi

tail -n 2000 "$OUT" > "$OUT.tmp" 2>/dev/null && mv "$OUT.tmp" "$OUT"