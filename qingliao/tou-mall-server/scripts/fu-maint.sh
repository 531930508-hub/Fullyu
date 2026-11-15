#!/usr/bin/env bash
# 轻疗维护页开关（P0-3）。用法: fu-maint.sh on|off|status
# on  = 全站返回 503 维护页（用于数据迁移等"必须挡住所有请求"的窗口）
# off = 恢复；502/503/504 仍会自动兜底到维护页（换 jar 窗口靠这个，不用开开关）
set -euo pipefail
INC=/etc/nginx/snippets/mall-maint.inc
[ -f "$INC" ] || { echo "缺少 $INC，先跑 fu-maint-install.py --apply"; exit 1; }

case "${1:-status}" in
on)
  printf '# 维护中（%s 由 fu-maint.sh 开启）\nreturn 503;\n' "$(date '+%F %T')" > "$INC"
  nginx -t 2>&1 | tail -2
  nginx -s reload
  echo "MAINTENANCE ON  $(date '+%F %T')"
  ;;
off)
  printf '# 正常（%s 由 fu-maint.sh 关闭）\n' "$(date '+%F %T')" > "$INC"
  nginx -t 2>&1 | tail -2
  nginx -s reload
  echo "MAINTENANCE OFF $(date '+%F %T')"
  ;;
status)
  if grep -q '^return 503;' "$INC"; then
    echo "state=ON   ($(grep -v '^#' "$INC" | head -1))"
  else
    echo "state=OFF"
  fi
  echo "--- 最近一次变更 ---"; head -1 "$INC"
  ;;
*)
  echo "用法: fu-maint.sh on|off|status"; exit 2 ;;
esac