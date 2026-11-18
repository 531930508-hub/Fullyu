#!/bin/bash
# 在场备机（121.40）发布：把主机 120.55 上**已上线**的产物同步到备机并重启，保证两端同源。
#
#   用法（在 120.55 上执行；CI 只发主机，备机靠本脚本追平）：
#     ./deploy-presence-standby.sh              # 同步 server dist + admin dist → 重启 → 双端 health
#     ./deploy-presence-standby.sh --tasks off  # 备机退出任务归属（常规：备机恒为 off）
#     ./deploy-presence-standby.sh --tasks on   # 备机接管任务（切机演练/真切换时）
#     ./deploy-presence-standby.sh --status     # 只读：两端 commit 痕迹、dist 摘要、任务开关、health
#
#   约定：
#   - 只同步 dist（server + admin），**不动备机 .env.local**（TASKS_ENABLED/REDIS/DB 都在那）；
#   - 同步用 rsync --delete（dist 是纯产物，删除陈旧文件是期望行为）；
#   - 备机全程在线可接请求；任务归属由 TASKS_ENABLED 控制，不在脚本里猜；
#   - 回滚：备机 /root/backups/presence-standby-<ts>.tar.gz 解回后 pm2 restart。
#
#   前置：120.55 root 的 ~/.ssh/id_ed25519_standby 已加入 121.40 root 的 authorized_keys。
set -euo pipefail

HOST=${STANDBY_HOST:-121.40.119.57}
KEY=${STANDBY_KEY:-$HOME/.ssh/id_ed25519_standby}
SSH="ssh -o BatchMode=yes -o ConnectTimeout=8 -i $KEY root@$HOST"
RSYNC="rsync -az --delete -e \"ssh -o BatchMode=yes -o ConnectTimeout=8 -i $KEY\""

SRV=/root/fullyu/apps/server
ADMIN=/opt/fullyu/apps/admin
LOCAL_HEALTH=http://127.0.0.1:3000/api/v1/health
PUBLIC_HEALTH=https://presence.fullyu.cn/api/v1/health

usage() { sed -n '2,20p' "$0"; exit 1; }
probe() { # probe <label> <cmd...>
  local label=$1; shift
  local code
  code=$("$@" 2>/dev/null || true)
  printf '  %-28s %s\n' "$label" "${code:-<failed>}"
}

action=${1:-sync}
case "$action" in
  --tasks)
    case "${2:-}" in
      on|off) ;;
      *) echo "--tasks 需要 on|off" >&2; exit 1 ;;
    esac
    $SSH "cd $SRV && cp -a .env.local .env.local.bak-\$(date +%Y%m%d-%H%M%S) && \
          if grep -q '^TASKS_ENABLED=' .env.local; then sed -i 's|^TASKS_ENABLED=.*|TASKS_ENABLED=${2}|' .env.local; \
          else echo 'TASKS_ENABLED=${2}' >> .env.local; fi && \
          pm2 restart fullyu-api --update-env >/dev/null && sleep 5 && \
          grep '^TASKS_ENABLED=' .env.local"
    exit 0 ;;
  --status)
    echo "== 主机 120.55 =="
    probe "local health" curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/v1/health
    probe "dist files" bash -c "find $SRV/dist -type f | wc -l"
    probe "admin files" bash -c "find $ADMIN/dist -type f | wc -l"
    probe "pm2 uptime" bash -c "pm2 jlist | python3 -c \"import sys,json;d=json.load(sys.stdin);p=[x for x in d if x['name']=='fullyu-api'][0];print(p['pm2_env']['pm_uptime'])\""
    echo "== 备机 $HOST =="
    $SSH "printf '  %-28s %s\n' 'local health' \$(curl -s -o /dev/null -w '%{http_code}' $LOCAL_HEALTH || true); \
          printf '  %-28s %s\n' 'dist files' \$(find $SRV/dist -type f | wc -l); \
          printf '  %-28s %s\n' 'admin files' \$(find $ADMIN/dist -type f | wc -l); \
          printf '  %-28s %s\n' 'TASKS_ENABLED' \$(grep -h '^TASKS_ENABLED=' $SRV/.env.local || echo unset); \
          printf '  %-28s %s\n' 'public via standby' \$(curl -s -o /dev/null -w '%{http_code}' --resolve presence.fullyu.cn:443:127.0.0.1 $PUBLIC_HEALTH || true)"
    exit 0 ;;
  sync) ;;
  *) usage ;;
esac

ts=$(date +%Y%m%d-%H%M%S)
echo "[1/4] 备机备份现有 dist → /root/backups/presence-standby-$ts.tar.gz"
$SSH "mkdir -p /root/backups && tar -C / -czf /root/backups/presence-standby-$ts.tar.gz $SRV/dist $ADMIN/dist 2>/dev/null || true"

echo "[2/4] 同步 server dist"
eval $RSYNC "$SRV/dist/" "root@$HOST:$SRV/dist/"

echo "[3/4] 同步 admin dist"
eval $RSYNC "$ADMIN/dist/" "root@$HOST:$ADMIN/dist/"

echo "[4/4] 重启备机并验证"
$SSH "pm2 restart fullyu-api --update-env >/dev/null && sleep 6 && \
      printf '  standby local health: %s\n' \$(curl -s -o /dev/null -w '%{http_code}' $LOCAL_HEALTH) && \
      printf '  standby nginx  health: %s\n' \$(curl -s -o /dev/null -w '%{http_code}' --resolve presence.fullyu.cn:443:127.0.0.1 $PUBLIC_HEALTH) && \
      printf '  TASKS_ENABLED: %s\n' \$(grep -h '^TASKS_ENABLED=' $SRV/.env.local || echo unset)"

echo "完成。两端文件数：
  主机 server=$(find $SRV/dist -type f | wc -l) admin=$(find $ADMIN/dist -type f | wc -l)
  备机 server=$($SSH "find $SRV/dist -type f | wc -l") admin=$($SSH "find $ADMIN/dist -type f | wc -l")"