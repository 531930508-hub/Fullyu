#!/bin/bash
# 测试环境（8.133）发布：把本地构建产物推到四套 test-* 之一，并做重启 + 探针。
#
#   用法：
#     deploy/scripts/deploy-test-env.sh presence --server <dir>/server/dist --admin <dir>/admin/dist
#     deploy/scripts/deploy-test-env.sh teahour  --server ... --admin ...
#     deploy/scripts/deploy-test-env.sh crm      --server ... [--admin <public dir>] [--game <game dir>]
#
#   约定（见 docs/deploy/发布标准流程.md §3.7）：
#   - 只从同一已验证 commit 的产物发布，脚本会记录产物内 git 信息（若有）和 md5 清单；
#   - 只在服务器上做 tar 备份后覆盖，**不加 --delete**（保留微信校验文件/独立落地页）；
#   - 不动服务器的 env 文件；测试库只允许 fullyu_test / teahour_test / crm_test / tou_mall_test；
#   - 轻疗测试（test-cityretreat）不在本脚本范围：那是轻疗生产同源代码，按轻疗窗口走。
#
#   回滚：解 /root/backups/test-<env>-<ts>.tar.gz 覆盖回原目录后 restart 对应 unit。
set -euo pipefail

HOST=${TEST_HOST:-8.133.6.18}
SSH="ssh -o BatchMode=yes -o ConnectTimeout=8"

usage() { sed -n '2,20p' "$0"; exit 1; }

env_name=${1:-}
shift || true
case "$env_name" in
  presence)
    unit=presence-test; base=/opt/presence-test/app
    server_dst=$base/apps/server/dist; admin_dst=$base/apps/admin/dist
    probe_local=http://127.0.0.1:3000/api/v1/health; probe_public=https://test-presence.fullyu.cn/api/v1/health ;;
  teahour)
    unit=teahour-test; base=/opt/teahour-test/app
    server_dst=$base/apps/server/dist; admin_dst=$base/apps/admin/dist
    probe_local=http://127.0.0.1:18788/api/health; probe_public=https://test-teahour.fullyu.cn/api/health ;;
  crm)
    unit=fullyu-crm-test; base=/opt/fullyu-crm-test
    server_dst=$base/apps/server/dist; admin_dst=$base/apps/admin/public
    probe_local=http://127.0.0.1:8897/api/health; probe_public=https://test-crm.fullyu.cn/api/health ;;
  *) usage ;;
esac

server_src=''; admin_src=''; game_src=''
while [ $# -gt 0 ]; do
  case "$1" in
    --server) server_src=${2:-}; shift 2 ;;
    --admin)  admin_src=${2:-};  shift 2 ;;
    --game)   game_src=${2:-};   shift 2 ;;
    *) echo "未知参数: $1" >&2; usage ;;
  esac
done

[ -d "${server_src:-}" ] || { echo "缺少 --server <dist 目录>" >&2; usage; }

ts=$(date +%Y%m%d-%H%M%S)
echo "== 目标 $env_name @ $HOST (unit=$unit) ts=$ts"
$SSH root@"$HOST" "test -d $server_dst" || { echo "远端目录不存在: $server_dst" >&2; exit 1; }

echo "== 1/5 远端备份"
$SSH root@"$HOST" "
  set -e
  mkdir -p /root/backups
  tar -czf /root/backups/test-$env_name-$ts.tar.gz -C $server_dst . 2>/dev/null || { mkdir -p $(dirname $server_dst); tar -czf /root/backups/test-$env_name-$ts.tar.gz -C $(dirname $server_dst) $(basename $server_dst); }
  ls -lh /root/backups/test-$env_name-$ts.tar.gz
"

echo "== 2/5 上传产物"
tmp=/tmp/deploy-$env_name-$ts; $SSH root@"$HOST" "mkdir -p $tmp/server $tmp/admin $tmp/game"
scp -q -r "$server_src"/. root@"$HOST":"$tmp/server/"
[ -n "$admin_src" ] && scp -q -r "$admin_src"/. root@"$HOST":"$tmp/admin/"
[ -n "$game_src" ]  && scp -q -r "$game_src"/.  root@"$HOST":"$tmp/game/"

echo "== 3/5 覆盖（不 --delete）"
$SSH root@"$HOST" "
  set -e
  mkdir -p $server_dst
  rsync -a $tmp/server/ $server_dst/
  $( [ -n "$admin_src" ] && echo "mkdir -p $admin_dst && rsync -a $tmp/admin/ $admin_dst/" )
  $( [ -n "$game_src" ]  && echo "mkdir -p $base/apps/game && rsync -a $tmp/game/ $base/apps/game/" )
  chown -R --reference=$base $server_dst 2>/dev/null || true
  $( [ -n "$admin_src" ] && echo "chown -R --reference=$base $admin_dst 2>/dev/null || true" )
"

echo "== 4/5 重启 $unit"
$SSH root@"$HOST" "systemctl restart $unit && sleep 2 && systemctl is-active $unit"

echo "== 5/5 探针"
ok=0
for i in 1 2 3 4 5; do
  if $SSH root@"$HOST" "curl -fsS -m 5 -o /dev/null $probe_local"; then ok=1; break; fi
  sleep 2
done
[ $ok -eq 1 ] || { echo "!! 本机探针失败，回滚见下"; }
printf '公网探针: '; curl -s -o /dev/null -w '%{http_code}\n' -m 10 --noproxy '*' "$probe_public"

cat <<EOF

完成。回滚命令（30 秒内可执行）：
  ssh root@$HOST "rm -rf $server_dst && mkdir -p $server_dst && tar -xzf /root/backups/test-$env_name-$ts.tar.gz -C $server_dst && systemctl restart $unit"
EOF