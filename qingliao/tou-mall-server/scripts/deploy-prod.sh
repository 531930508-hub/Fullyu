#!/usr/bin/env bash
# 轻疗生产发版（换 jar）一条命令：前置检查 → 库快照 → 上传校验 → (可选)DDL → 停→换→起 → 冒烟 → 失败自动回滚。
#
# 用法:
#   deploy-prod.sh <new.jar> [--with-sql] [--skip-preflight] [--dry-run]
#   deploy-prod.sh <new.jar> --with-sql      # 同时按序执行 sql/prod/*.sql（发版日第一次用这个）
#
# 不做的事（必须人做）：
#   - 填写 RDS 自动备份策略（见 生产方案 §4.2 P11）
#   - 微信后台提审/发布、汇付后台配置
#   - 管理端前端 dist 的发布（若本次前端也变，另按 §7.x 发布）
set -uo pipefail

PROD=root@8.133.6.18
TEST=test-cityretreat
APP_DIR=/server/java/fully
JAR_NAME=mall-admin-1.0-SNAPSHOT.jar
JAVA_CMD='java -Xms2048m -Xmx4096m -Dspring.profiles.active=prod'
SSH_PROD=(ssh -o ConnectTimeout=15 -o BatchMode=yes -i "$HOME/.ssh/id_ed25519" -o IdentitiesOnly=yes "$PROD")
SSH_TEST=(ssh -o ConnectTimeout=15 -o BatchMode=yes "$TEST")
REPO="$(cd "$(dirname "$0")/.." && pwd)"

JAR=""; WITH_SQL=0; SKIP_PF=0; DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
  --with-sql) WITH_SQL=1; shift ;;
  --skip-preflight) SKIP_PF=1; shift ;;
  --dry-run) DRY=1; shift ;;
  -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
  *) JAR="$1"; shift ;;
  esac
done
[ -n "$JAR" ] || { echo "用法: deploy-prod.sh <new.jar> [--with-sql] [--skip-preflight] [--dry-run]"; exit 2; }
[ -f "$JAR" ] || { echo "找不到 jar: $JAR"; exit 2; }

sha() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
DRY_RUN() { [ "$DRY" = 1 ]; }
say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
die() { printf '\033[31m中止: %s\033[0m\n' "$*" >&2; exit 1; }

NEW_SHA=$(sha "$JAR") || die "算不出 sha256"
NEW_SIZE=$(wc -c < "$JAR" | tr -d ' ')
say "新包 $(basename "$JAR")  ${NEW_SIZE}B  sha256=${NEW_SHA:0:16}…"

# ---------- 1 前置检查 ----------
if [ "$SKIP_PF" = 0 ] && ! DRY_RUN; then
  say "1/6 前置检查"
  "$REPO/scripts/preflight.sh" --jar "$JAR" || die "preflight 有 FAIL 项"
elif [ "$SKIP_PF" = 1 ]; then
  say "1/6 前置检查（已跳过）"
fi

# ---------- 2 数据库快照 ----------
say "2/6 数据库快照"
if DRY_RUN; then
  echo "    [dry-run] ssh $TEST '/root/bin/prod-db-dump.sh tou_mall_current'"
else
  SNAP=$("${SSH_TEST[@]}" '/root/bin/prod-db-dump.sh tou_mall_current' 2>&1 | tail -3)
  echo "$SNAP" | sed 's/^/    /'
  echo "$SNAP" | grep -q '\.sql\.gz' || die "快照没产出 .sql.gz，中止（不能在没有退路时换 jar）"
fi

# ---------- 3 上传 + 校验 ----------
say "3/6 上传新包"
if DRY_RUN; then
  echo "    [dry-run] scp $JAR $PROD:$APP_DIR/.incoming/${NEW_SHA:0:12}.jar"
else
  "${SSH_PROD[@]}" "mkdir -p $APP_DIR/.incoming" || die "建 .incoming 失败"
  scp -o ConnectTimeout=15 -i "$HOME/.ssh/id_ed25519" -o IdentitiesOnly=yes -q "$JAR" \
    "$PROD:$APP_DIR/.incoming/${NEW_SHA:0:12}.jar" || die "上传失败"
  RMT=$("${SSH_PROD[@]}" "sha256sum $APP_DIR/.incoming/${NEW_SHA:0:12}.jar | cut -d' ' -f1")
  [ "$RMT" = "$NEW_SHA" ] && echo "    远端校验一致" || die "远端 jar sha256 不一致（$RMT）"
fi

# ---------- 4 可选 DDL ----------
if [ "$WITH_SQL" = 1 ]; then
  say "4/6 执行 DDL（sql/prod，按文件名顺序）"
  if DRY_RUN; then
    echo "    [dry-run] 上传 $REPO/sql/prod → $TEST:/tmp/sql-prod，然后逐个 mysql < file"
  else
    tar -C "$REPO/sql" -czf /tmp/deploy-sqlprod.tar.gz prod 2>/dev/null
    scp -o ConnectTimeout=15 -q /tmp/deploy-sqlprod.tar.gz "$TEST:/tmp/" || die "DDL 包上传失败"
    OUT=$("${SSH_TEST[@]}" 'bash -s' <<'REMOTE'
set -uo pipefail
rm -rf /tmp/sql-prod && mkdir -p /tmp/sql-prod && tar -C /tmp/sql-prod -xzf /tmp/deploy-sqlprod.tar.gz 2>/dev/null
fails=0; n=0
for f in $(ls /tmp/sql-prod/prod/2026-*.sql | sort); do
  n=$((n+1))
  if ! out=$(mysql --defaults-extra-file=/root/.rds.txt tou_mall_current < "$f" 2>&1); then
    echo "FAIL $(basename "$f") :: $(echo "$out" | head -1)"; fails=$((fails+1)); break
  fi
done
echo "DDL_SUMMARY n=$n fails=$fails"
REMOTE
)
    echo "$OUT" | sed 's/^/    /'
    echo "$OUT" | grep -q 'fails=0' || die "DDL 执行失败，已停在换 jar 之前（库已加过的列留着无害）"
  fi
else
  say "4/6 跳过 DDL（--with-sql 未给）"
fi

# ---------- 5-6 换 jar + 冒烟（远端原子块，带自动回滚） ----------
say "5/6 停 → 换 → 起"
if DRY_RUN; then
  cat <<EOF
    [dry-run] 远端将执行:
      TS=<时间戳>; 建 $APP_DIR/backup/\$TS/ 并清单化当前 jar
      SIGTERM → 等 20s → KILL
      mv .incoming/${NEW_SHA:0:12}.jar → $APP_DIR/$JAR_NAME
      nohup $JAVA_CMD -jar $JAR_NAME >> logs/mall-admin-\$TS.log
      轮询 http://127.0.0.1:9929/health 至多 150s，失败则用 backup/\$TS 的 jar 自动回滚
EOF
  say "6/6 冒烟"
  echo "    [dry-run] /health、cityretreat、manage、/api/product/list 四项"
  exit 0
fi

# JAVA_CMD 含空格，必须单引号包住再传给远端，否则远端把 -Xms2048m 当命令（2026-11-15 实测 exit 127）
REMOTE_ENV="NEW_SHA=$NEW_SHA APP_DIR=$APP_DIR JAR_NAME=$JAR_NAME JAVA_CMD='$JAVA_CMD'"
"${SSH_PROD[@]}" "$REMOTE_ENV bash -s" <<'REMOTE'
set -uo pipefail
TS=$(date +%Y%m%d-%H%M%S)
BK="$APP_DIR/backup/$TS"; mkdir -p "$BK"
echo "release_dir=$BK"

# --- 记录当前运行态（回滚依据）---
PID=$(ps -C java -o pid=,cmd= --no-headers | grep "$JAR_NAME" | awk '{print $1}' | head -1)
[ -n "${PID:-}" ] || { echo "ABORT 没找到正在跑的 $JAR_NAME"; exit 10; }
cp -p "$APP_DIR/$JAR_NAME" "$BK/$JAR_NAME" || { echo "ABORT 备份当前 jar 失败"; exit 11; }
OLD_SHA=$(sha256sum "$BK/$JAR_NAME" | cut -d' ' -f1)
CMDLINE=$(tr '\0' ' ' < /proc/$PID/cmdline)
cat > "$BK/MANIFEST.txt" <<EOF
release=$TS
old_jar_sha256=$OLD_SHA
old_pid=$PID
old_started=$(ps -o lstart= -p $PID)
old_cmdline=$CMDLINE
new_jar_sha256=$NEW_SHA
EOF
echo "old_jar_sha256=$OLD_SHA"

start_app() {   # $1=要启动的 jar 绝对路径
  cd "$APP_DIR"
  mkdir -p logs
  nohup $JAVA_CMD -jar "$1" >> "logs/mall-admin-$(date +%F).log" 2>&1 &
  echo $!
}
wait_health() { # $1=秒上限
  local i=0
  while [ $i -lt "$1" ]; do
    if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:9929/health)" = "200" ]; then return 0; fi
    sleep 3; i=$((i+3))
  done
  return 1
}
stop_app() {
  local p; p=$(ps -C java -o pid=,cmd= --no-headers | grep "$JAR_NAME" | awk '{print $1}' | head -1)
  [ -z "$p" ] && return 0
  kill "$p" 2>/dev/null
  for i in $(seq 1 20); do kill -0 "$p" 2>/dev/null || return 0; sleep 1; done
  kill -9 "$p" 2>/dev/null; sleep 2
}

# --- 换 ---
stop_app
cp -p "$APP_DIR/.incoming/$(echo $NEW_SHA | cut -c1-12).jar" "$APP_DIR/$JAR_NAME" || { echo "ABORT 覆盖 jar 失败"; start_app "$APP_DIR/$JAR_NAME"; exit 12; }
NEW_ON_DISK=$(sha256sum "$APP_DIR/$JAR_NAME" | cut -d' ' -f1)
[ "$NEW_ON_DISK" = "$NEW_SHA" ] || { echo "ABORT 落盘 sha 不符"; cp -p "$BK/$JAR_NAME" "$APP_DIR/$JAR_NAME"; start_app "$APP_DIR/$JAR_NAME"; exit 13; }
NEWPID=$(start_app "$APP_DIR/$JAR_NAME")
echo "new_pid=$NEWPID"

if wait_health 150; then
  echo "HEALTH_OK"
else
  echo "HEALTH_FAIL 150s 内没起来，开始回滚"
  tail -n 40 "$APP_DIR/logs/mall-admin-$(date +%F).log" | sed 's/^/    LOG /'
  stop_app
  cp -p "$BK/$JAR_NAME" "$APP_DIR/$JAR_NAME"
  start_app "$APP_DIR/$JAR_NAME" >/dev/null
  if wait_health 150; then echo "ROLLBACK_OK 已回到 $OLD_SHA"; else echo "ROLLBACK_FAIL 需要人工介入（见 $BK）"; fi
  exit 20
fi
REMOTE
RC=$?

if [ $RC -ne 0 ]; then
  echo
  case $RC in
  10|11|12|13) die "在“换”之前就停了，线上仍是原 jar（无需回滚）" ;;
  20) die "新 jar 起不来，已尝试自动回滚（看上面 ROLLBACK_OK/FAIL）" ;;
  *) die "远端退出码 $RC" ;;
  esac
fi

# ---------- 6 冒烟 ----------
say "6/6 冒烟"
FAIL=0
for u in http://127.0.0.1:9929/health https://cityretreat.fullyu.cn/ https://cityretreat.fullyu.cn/api/product/list https://manage.fullytherapy.com/; do
  c=$("${SSH_PROD[@]}" "curl -s -o /dev/null -w '%{http_code}' --max-time 8 '$u'")
  if [ "$c" = "200" ]; then echo "    PASS $u"; else echo "    FAIL $u -> $c"; FAIL=1; fi
done
LOGERR=$("${SSH_PROD[@]}" "grep -c ' ERROR ' $APP_DIR/logs/mall-admin-$(date +%F).log 2>/dev/null || echo 0")
echo "    今日日志 ERROR 计数: $LOGERR（新进程刚起，应为 0 或极少）"

if [ $FAIL -ne 0 ]; then
  echo
  echo "冒烟有失败项。要不要回滚由你判断："
  echo "  回滚命令：$0 回滚不做自动 -> 手工按 $APP_DIR/backup/<最新TS>/MANIFEST.txt 与 ROLLBACK.md 操作"
  echo "  或直接：ssh $PROD 'cd $APP_DIR && cp backup/<TS>/$JAR_NAME . && '/root/bin/fu-maint.sh' status'"
  exit 1
fi
say "发版完成"
echo "  新 jar sha256=$NEW_SHA"
echo "  回滚包：$APP_DIR/backup/<本次TS>/（含本次替换前的 jar 与 MANIFEST）"
echo "  库快照：$TEST:/opt/fullyu-mall-backups/db/（本次新导一份）"
echo "  若本次同时改了前端 dist / 小程序，另按 §7.9、§7.x 发布"