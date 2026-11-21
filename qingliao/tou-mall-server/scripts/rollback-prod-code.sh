#!/usr/bin/env bash
# 代码侧回滚：
#   1) 把指定备份目录里的 jar 放回 /server/java/fully/mall-admin-1.0-SNAPSHOT.jar 并重启（走 start-120.sh）
#   2) 可选：把前端 dist 换回备份目录
#   3) 冒烟
#
# 库的回滚用 ssh test-cityretreat /root/bin/night2-rollback.sh db（那边有 RDS 凭据）。
#
# 2026-11-19 修：PROD 曾写死 8.133.6.18（测试机），"回滚生产"实际会去重启测试机上的 jar；
#   起进程也绕过 start-120.sh（丢 JDK8/env/redis 密码）。现在默认 120.55.36.3 + 开跑前校验身份。
#
# 用法:
#   rollback-prod-code.sh --jar-dir 20261115-230731 [--restore-dist dist.bak-night2-20261115-230341] [--dry-run]
set -uo pipefail
PROD=${PROD:-root@120.55.36.3}
KEY=$HOME/.ssh/id_ed25519
APP_DIR=/server/java/fully
JAR_NAME=mall-admin-1.0-SNAPSHOT.jar
START_SCRIPT=$APP_DIR/start-120.sh
SSH="ssh -o ConnectTimeout=15 -o BatchMode=yes -i $KEY -o IdentitiesOnly=yes $PROD"
JAR_DIR=""; DIST=""; DRY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --jar-dir) JAR_DIR="${2:-}"; shift 2 ;;
    --restore-dist) DIST="${2:-}"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "未知参数: $1"; exit 2 ;;
  esac
done
[ -n "$JAR_DIR" ] || { echo "必须给 --jar-dir（$APP_DIR/backup/ 下的目录名）"; exit 2; }

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
run() { if [ "$DRY" = 1 ]; then echo "    [dry-run] $*"; else eval "$*"; fi; }

say "0 校验 $PROD 是生产机"
if [ "$DRY" = 0 ]; then
  $SSH "test -f $START_SCRIPT && ! test -d /opt/fullyu-mall-test" \
    || { echo "远端 $PROD 不像生产（缺 $START_SCRIPT 或存在 /opt/fullyu-mall-test）——检查 PROD，8.133.6.18 是测试机"; exit 4; }
fi

say "1 目标 jar"
$SSH "test -f $APP_DIR/backup/$JAR_DIR/$JAR_NAME" || { echo "备份里没有这个 jar：$APP_DIR/backup/$JAR_DIR/$JAR_NAME"; exit 3; }
TARGET_SHA=$($SSH "sha256sum $APP_DIR/backup/$JAR_DIR/$JAR_NAME | cut -d' ' -f1")
LIVE_SHA=$($SSH "sha256sum $APP_DIR/$JAR_NAME | cut -d' ' -f1")
echo "    要回滚到 sha256=$TARGET_SHA"
echo "    当前线上 sha256=$LIVE_SHA"

say "2 换 jar + 重启（180s 健康检查，失败自动再换回当前线上 jar）"
run "$SSH 'NEW=\$1 OLD=\$2 bash -s' <<\"REMOTE\"
set -uo pipefail
cd $APP_DIR
BK=backup/pre-rollback-\$(date +%Y%m%d-%H%M%S); mkdir -p \$BK
cp -p $APP_DIR/$JAR_NAME \$BK/$JAR_NAME
# 必须「拷到临时文件再 mv 原子替换」：直接 cp 覆盖正在运行的 jar 会原地改写同一 inode，
# JVM 懒加载类时读到坏字节码，抛 NoClassDefFoundError（2026-11-15 回滚踩过）。
cp -p $APP_DIR/backup/$JAR_DIR/$JAR_NAME $APP_DIR/.jar.new.\$\$
mv -f $APP_DIR/.jar.new.\$\$ $APP_DIR/$JAR_NAME
p=\$(pgrep -f 'jar $JAR_NAME' | head -1)
if [ -n \"\$p\" ]; then
  kill \$p
  for i in \$(seq 1 30); do kill -0 \$p 2>/dev/null || break; sleep 1; done
  # 生产 JVM 对 SIGTERM 无响应（11-19 实测满 30s 不退），必须兜底 -9，否则 start-120.sh 会因"已在跑"直接退出
  kill -0 \$p 2>/dev/null && { kill -9 \$p; sleep 2; }
fi
bash $START_SCRIPT >/dev/null 2>&1
for i in \$(seq 1 60); do
  [ \"\$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:9929/health)\" = 200 ] && { echo HEALTH_OK; exit 0; }
  sleep 3
done
echo HEALTH_FAIL; p=\$(pgrep -f 'jar $JAR_NAME'); [ -n \"\$p\" ] && { kill \$p; sleep 5; kill -9 \$p 2>/dev/null; }
cp -p \$BK/$JAR_NAME $APP_DIR/.jar.new.\$\$; mv -f $APP_DIR/.jar.new.\$\$ $APP_DIR/$JAR_NAME
bash $START_SCRIPT >/dev/null 2>&1
echo REVERTED_TO_CURRENT
REMOTE"

if [ -n "$DIST" ]; then
  say "3 前端 dist 换回 $DIST"
  run "$SSH 'cd /server/www/fully && [ -d ${DIST} ] && { rm -rf dist.discard-\$(date +%s) && mv dist dist.discard-\$(date +%s) && mv ${DIST} dist && echo DIST_RESTORED; } || echo \"no such dir: ${DIST}\"'"
fi

say "4 冒烟"
if [ "$DRY" = 0 ]; then
  for u in http://127.0.0.1:9929/health https://cityretreat.fullyu.cn/; do
    printf '    %s -> ' "$u"; $SSH "curl -s -o /dev/null -w '%{http_code}\n' --max-time 8 '$u'"
  done
  echo "    线上 jar 现在: $($SSH "sha256sum $APP_DIR/$JAR_NAME | cut -d' ' -f1")"
fi