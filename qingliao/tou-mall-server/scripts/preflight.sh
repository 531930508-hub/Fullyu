#!/usr/bin/env bash
# 轻疗生产发版前置检查（只读，不改任何状态）。
# 用法: preflight.sh [--jar <新jar路径>]
# 退出码: 0 全部通过或有 WARN；1 有 FAIL。
# 设计原则：只查"换了会不会出事"，不查"业务对不对"；任何 FAIL 都应该先解决再发版。
set -uo pipefail

PROD=root@8.133.6.18
TEST=mall-test
SSH_PROD="ssh -o ConnectTimeout=15 -o BatchMode=yes -i $HOME/.ssh/id_ed25519 -o IdentitiesOnly=yes $PROD"
SSH_TEST="ssh -o ConnectTimeout=15 -o BatchMode=yes $TEST"
APP_DIR=/server/java/fully
RB_PKG=$APP_DIR/backup/20261113-225339
RB_SHA_EXPECT=a1fc446eaa00d75d8065923f6248d5a504547278a29288308165bb8d7d320436
SNAP_DIR=/opt/fullyu-mall-backups/db
SQL_DIR="$(cd "$(dirname "$0")/.." && pwd)/sql"
JAR=""

while [ $# -gt 0 ]; do
  case "$1" in
  --jar) JAR="${2:-}"; shift 2 ;;
  *) echo "用法: preflight.sh [--jar <新jar路径>]"; exit 2 ;;
  esac
done

FAIL=0; WARN=0
ok()   { printf '  \033[32mPASS\033[0m  %s\n' "$*"; }
warn() { printf '  \033[33mWARN\033[0m  %s\n' "$*"; WARN=$((WARN+1)); }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$*"; FAIL=$((FAIL+1)); }
sec()  { printf '\n[%s]\n' "$*"; }

sec "1 连接"
$SSH_PROD 'true' 2>/dev/null && ok "生产 $PROD 可连" || bad "生产 $PROD 连不上"
$SSH_TEST 'true' 2>/dev/null && ok "测试 $TEST 可连" || bad "测试 $TEST 连不上"

sec "2 生产进程与入口"
PROC=$($SSH_PROD "ps -C java -o pid=,lstart=,cmd= --no-headers | grep 'mall-admin' | head -1" 2>/dev/null)
if [ -n "$PROC" ]; then
  ok "进程在跑: $(echo "$PROC" | tr -s ' ' | cut -c1-90)"
else
  bad "没找到 mall-admin 进程（可能已停或已挂）"
fi
PORT=$($SSH_PROD "ss -lntp 2>/dev/null | grep -c ':9929 '" 2>/dev/null)
[ "${PORT:-0}" -ge 1 ] && ok "9929 在监听" || bad "9929 未监听"
H=$($SSH_PROD "curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:9929/health" 2>/dev/null)
[ "$H" = "200" ] && ok "本机 /health = 200" || bad "本机 /health = $H（应为 200）"
for u in https://cityretreat.fullyu.cn/ https://manage.fullytherapy.com/; do
  c=$($SSH_PROD "curl -s -o /dev/null -w '%{http_code}' --max-time 8 '$u'" 2>/dev/null)
  [ "$c" = "200" ] && ok "外网 $u = 200" || bad "外网 $u = $c"
done

sec "3 机器余量（换 jar 期间会短暂双份 jar，约 310MB）"
DISK=$($SSH_PROD "df -P / | awk 'NR==2{print \$4\" \"\$5}'" 2>/dev/null)
AVAIL_G=$(( $(echo "$DISK" | awk '{print $1}') / 1024 / 1024 ))
USED=$(echo "$DISK" | awk '{print $2}' | tr -d '%')
[ "$AVAIL_G" -ge 10 ] && ok "根分区剩余 ${AVAIL_G}G（已用 ${USED}%）" || bad "根分区仅剩 ${AVAIL_G}G"
[ "$USED" -lt 85 ] && ok "磁盘使用率 ${USED}% < 85%" || warn "磁盘使用率 ${USED}% 偏高"
MEMF=$($SSH_PROD "awk '/MemAvailable/{print int(\$2/1024)}' /proc/meminfo" 2>/dev/null)
[ "${MEMF:-0}" -ge 1500 ] && ok "可用内存 ${MEMF}MB" || warn "可用内存仅 ${MEMF}MB（jar 堆上限 4G，切换瞬间要两份 RSS 风险）"

sec "4 nginx 与维护页"
$SSH_PROD 'nginx -t' >/dev/null 2>&1 && ok "nginx -t 通过" || bad "nginx -t 不通过（先修配置再发版）"
for f in /server/www/mall-maint/__maintenance.html /server/www/mall-maint/__maint_api.json /etc/nginx/snippets/mall-maint.inc; do
  $SSH_PROD "test -f $f" && ok "存在 $f" || bad "缺失 $f（换 jar 窗口就没有兜底页了）"
done
ST=$($SSH_PROD '/root/bin/fu-maint.sh status 2>/dev/null | head -1' 2>/dev/null)
case "$ST" in
  state=OFF*) ok "维护开关 state=OFF" ;;
  state=ON*)  warn "维护开关处于 ON —— 发版完记得 off" ;;
  *)          bad "读不到维护开关状态（脚本没装？）" ;;
esac

sec "5 证书"
CERT=$($SSH_PROD "grep -m1 ssl_certificate /etc/nginx/conf.d/cityretreat.conf | awk '{print \$2}' | tr -d ';'" 2>/dev/null)
# 日期计算放在远端 Linux 做（本机 macOS 的 date 不支持 -d）
LEFT=$($SSH_PROD "bash -c 'end=\$(openssl x509 -in \"$CERT\" -noout -enddate 2>/dev/null | cut -d= -f2); [ -n \"\$end\" ] && echo \$(( ( \$(date -d \"\$end\" +%s) - \$(date +%s) ) / 86400 )) || echo none'" 2>/dev/null)
case "$LEFT" in
  ''|none) warn "读不到站点证书到期时间（$CERT）" ;;
  *) [ "$LEFT" -ge 14 ] && ok "站点证书 $LEFT 天后到期" || bad "站点证书仅剩 $LEFT 天，先续证书" ;;
esac

sec "6 回滚包"
SHA=$($SSH_PROD "sha256sum $RB_PKG/mall-admin-1.0-SNAPSHOT.jar 2>/dev/null | cut -d' ' -f1" 2>/dev/null)
[ "$SHA" = "$RB_SHA_EXPECT" ] && ok "回滚 jar sha256 与登记一致" || bad "回滚 jar sha256 不符或缺失（$SHA）"
LIVE=$($SSH_PROD "sha256sum $APP_DIR/mall-admin-1.0-SNAPSHOT.jar 2>/dev/null | cut -d' ' -f1" 2>/dev/null)
[ "$LIVE" = "$SHA" ] && ok "线上 jar 与回滚包字节一致（回滚=真回到现在）" \
  || warn "线上 jar 与回滚包不一致（线上被换过？确认回滚目标）"
$SSH_PROD "test -f $RB_PKG/ROLLBACK.md && test -f $RB_PKG/MANIFEST.txt" \
  && ok "回滚步骤与清单都在" || bad "回滚包缺 ROLLBACK.md / MANIFEST.txt"

sec "7 数据库快照"
LATEST=$($SSH_TEST "ls -t $SNAP_DIR/tou_mall_current-*.sql.gz 2>/dev/null | head -1" 2>/dev/null)
if [ -n "$LATEST" ]; then
  AGE_H=$($SSH_TEST "bash -c 'echo \$(( ( \$(date +%s) - \$(stat -c %Y \"$LATEST\") ) / 3600 ))'" 2>/dev/null)
  [ "${AGE_H:-999}" -le 24 ] && ok "最新快照 ${AGE_H}h 前（$(basename "$LATEST")）" \
    || warn "最新快照已 ${AGE_H}h 前，发版前建议重导一份"
  GZ=$($SSH_TEST "gzip -t '$LATEST' && echo good" 2>/dev/null)
  [ "$GZ" = "good" ] && ok "快照 gzip 完整" || bad "快照 gzip 损坏"
  META="$LATEST.meta"
  REC=$($SSH_TEST "grep -o 'sha256=[0-9a-f]*' '$META' 2>/dev/null | head -1 | cut -d= -f2" 2>/dev/null)
  NOW=$($SSH_TEST "sha256sum '$LATEST' | cut -d' ' -f1" 2>/dev/null)
  [ -n "$REC" ] && [ "$REC" = "$NOW" ] && ok "快照 sha256 与 .meta 登记一致" \
    || warn "快照 sha256 无法比对（.meta 缺失或未记录）"
else
  bad "$SNAP_DIR 下没有 tou_mall_current 快照"
fi

sec "8 RDS 可达与基线"
R=$($SSH_TEST "mysql --defaults-extra-file=/root/.rds.txt tou_mall_current -N -e \"select concat(count(*)) from information_schema.tables where table_schema='tou_mall_current'\" 2>/dev/null" 2>/dev/null)
if [ -n "$R" ]; then
  ok "RDS 可连，当前 $R 张表"
  $SSH_TEST "mysql --defaults-extra-file=/root/.rds.txt tou_mall_current -N -e \"select 'orders',count(*) from s_order union all select 'customers',count(*) from c_customer union all select 'order_detail',count(*) from oms_order_detail\"" 2>/dev/null \
    | sed 's/^/          /'
else
  bad "RDS 连不上（检查 121.40 白名单/凭据 /root/.rds.txt）"
fi

sec "9 SQL 脚本"
if [ -d "$SQL_DIR" ]; then
  if python3 "$(dirname "$0")/make-prod-sql.py" --check >/dev/null 2>&1; then
    ok "sql/prod 与 sql/ 同步"
  else
    bad "sql/prod 与 sql/ 不同步（跑 make-prod-sql.py）"
  fi
  N=$(ls "$SQL_DIR"/prod/2026-*.sql 2>/dev/null | wc -l | tr -d ' ')
  [ "$N" = "37" ] && ok "生产脚本 $N 个（与 2026-11-13 幂等验证基线一致）" \
    || warn "生产脚本 $N 个（基线 37，多了就要重新验证幂等再发版）"
else
  bad "找不到 $SQL_DIR"
fi

sec "10 待发布的 jar"
if [ -n "$JAR" ]; then
  if [ ! -f "$JAR" ]; then
    bad "本地找不到 $JAR"
  else
    JS=$(sha256sum "$JAR" | cut -d' ' -f1)
    SIZE=$(stat -c %s "$JAR" 2>/dev/null || stat -f %z "$JAR")
    ok "新 jar $(basename "$JAR") ${SIZE}B sha256=${JS:0:16}…"
    [ "$JS" = "$SHA" ] && warn "新 jar 与线上 jar 完全相同 —— 这是一次空发布吗？"
    unzip -t "$JAR" >/dev/null 2>&1 || jar tf "$JAR" >/dev/null 2>&1 \
      && ok "jar 包结构可读" || bad "jar 包损坏（zip 校验失败）"
  fi
else
  warn "未指定 --jar，跳过新包检查"
fi

printf '\n===== 汇总: FAIL=%d WARN=%d =====\n' "$FAIL" "$WARN"
[ "$FAIL" -eq 0 ] || { echo "有 FAIL 项，先解决再发版。"; exit 1; }
echo "可以发版。"