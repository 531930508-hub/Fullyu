#!/usr/bin/env bash
# 轻疗换 jar 执行器（批次 1）—— 在 120.55 上以 root 运行
#
# 设计原则：
#   1) 默认 dry-run，只打印将执行的命令；加 --yes 才真动
#   2) 任一步失败立刻停，且已挂的维护页保持挂着（宁可 503 也不半死不活）
#   3) 不碰 nginx 配置、不重启 nginx、不动在场/时叙进程（只按 jar 名停轻疗）
#
# 用法：
#   ./qingliao-jar-swap.sh --sql-dir /root/sql-migrate-YYYYMMDD/prod [--yes] [--stop-after-sql]
#
#   --stop-after-sql：只做 M0–M3，做完 SQL 就停在维护页并退出。
#     用途：把手册 M4「sql-audit 必须 exit 0」变成真闸门——审计通过后再无参数重跑一次
#     （M0/M2 幂等，M3 脚本本身幂等）或手工执行 M5–M8。默认行为不带这个闸门。
#
# 前置（由手册 M0/M1 保证）：
#   - RDS 手工快照已建（快照 ID 由人记入手册 §10.6）
#   - /server/java/fully/staging/mall-admin-1.0-SNAPSHOT.jar sha256 = $EXPECT_SHA
#   - 库结构对账缺 110 对象（= 正常起点）
set -euo pipefail

BASE=/server/java/fully
CNF=/etc/fullyu/qingliao-backup.cnf
DB=tou_mall_current
JAR=mall-admin-1.0-SNAPSHOT.jar
EXPECT_SHA=960fd08b85589aac7826c8d55e2797f0b22f66cc8ad98c9ff2221037153f1baa
EXPECT_SIZE=311584964
MAINT=/root/bin/fu-maint.sh
SQL_DIR=""
APPLY=0
STOP_AFTER_SQL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --sql-dir) SQL_DIR="$2"; shift 2 ;;
    --yes) APPLY=1; shift ;;
    --stop-after-sql) STOP_AFTER_SQL=1; shift ;;
    *) echo "未知参数: $1"; exit 2 ;;
  esac
done

log() { echo "[$(date +%T)] $*"; }
run() { if [ "$APPLY" = 1 ]; then eval "$@"; else echo "DRY: $*"; fi; }
die() { echo "!! $*"; echo "!! 维护页保持现状：$($MAINT status 2>/dev/null | head -1)"; exit 1; }
q() { mysql --defaults-extra-file=$CNF -N -e "$1"; }

# ---------- G0 前置 ----------
[ "$APPLY" = 1 ] || log "DRY-RUN：只打印，不执行。确认无误后加 --yes"
[ -f "$BASE/staging/$JAR" ] || die "staging jar 不存在"
ACT=$(sha256sum "$BASE/staging/$JAR" | cut -d' ' -f1)
[ "$ACT" = "$EXPECT_SHA" ] || die "staging sha 不符: $ACT"
SZ=$(stat -c %s "$BASE/staging/$JAR")
[ "$SZ" = "$EXPECT_SIZE" ] || die "staging size 不符: $SZ"
[ -n "$SQL_DIR" ] && [ -d "$SQL_DIR" ] || die "--sql-dir 不存在"
CNT=$(ls "$SQL_DIR"/*.sql 2>/dev/null | grep -vc customer-nickname-anonymize)
[ "$CNT" -ge 40 ] || die "SQL 数量异常（排除延后脚本后应 ≥40，实际 $CNT）"
# 必须用 sql/prod/ 生成版：sql/ 里是测试版，守卫 IF(DATABASE()='tou_mall_test',…) 会在生产
# 直接 1146 报错。2026-11-19 踩过一次（rsync 整个 sql/ 目录，跑到了测试版）。
if grep -lq "DATABASE()='tou_mall_test'" "$SQL_DIR"/*.sql 2>/dev/null; then
  die "SQL_DIR 含测试库守卫（$SQL_DIR 是测试版）。请用 sql/prod/（make-prod-sql.py 生成）"
fi
# 已知顺序依赖：member-card.sql 建 s_member_card_config，v2 在其上加列，但 v2 字典序在前。
PREREQ="2026-11-07-member-card.sql"
[ -f "$SQL_DIR/$PREREQ" ] || die "缺少顺序前置脚本 $PREREQ"
N=$(ps -C java -o args= | grep -c -- "-jar .*$JAR")
[ "$N" -eq 1 ] || die "轻疗 java 进程数应为 1，实际 $N"
AVAIL=$(df --output=avail -BG / | tail -1 | tr -dc '0-9')
[ "$AVAIL" -ge 2 ] || die "根盘余量 ${AVAIL}G < 2G"
BEFORE_MISSING=$(q "select count(*) from information_schema.tables where table_schema='$DB'") && log "库表数=$BEFORE_MISSING"
log "前置全部通过：sha/size/脚本数/进程/磁盘"

# ---------- M0.2 逻辑备份 + binlog 位点（RDS 快照不可用时的一等替代） ----------
# 该库实际不在 presence-app 所属账号（API NotFound），拿不到手动快照；
# 用 fully 账号做一致性导出（--single-transaction）并记录 binlog 位点，可恢复 + 可 PITR。
#
# 2026-11-18 修正：本机 mysqldump 8.4 连 8.0.36 时，--master-data/--source-data 会发
# `SHOW BINARY LOG STATUS`（8.4 专有语法）→ 1064，dump 直接失败。改为：
#   (a) 起一个短暂 FTWRL 会话冻结写入，(b) 此时取 SHOW MASTER STATUS 作为精确位点，
#   (c) 在锁内跑 --single-transaction 导出，(d) 杀掉锁会话释放。库仅 ~11MB，压十几秒。
LOCK_PID=""
TS=$(date +%Y%m%d-%H%M%S)
if [ "$APPLY" = 1 ]; then
  mysql --defaults-extra-file=$CNF -e "FLUSH TABLES WITH READ LOCK; SELECT SLEEP(120); UNLOCK TABLES;" >/dev/null 2>&1 &
  LOCK_PID=$!
  sleep 2
fi
run "mysql --defaults-extra-file=$CNF -e 'show master status' | tee /root/backups/pre-jar-$TS.binlog"
run "mysqldump --defaults-extra-file=$CNF --single-transaction --set-gtid-purged=OFF --routines --triggers --events --hex-blob $DB | gzip > /root/backups/pre-jar-$TS.sql.gz"
if [ -n "$LOCK_PID" ]; then
  kill "$LOCK_PID" 2>/dev/null || true
  wait "$LOCK_PID" 2>/dev/null || true
fi
run "BACKUP_LOG=/var/log/fu-backup-qingliao.log /usr/local/bin/fu-backup-qingliao.sh"
if [ "$APPLY" = 1 ]; then
  ls -lh /root/backups/pre-jar-$TS.sql.gz || die "dump 未生成"
  gzip -t /root/backups/pre-jar-$TS.sql.gz || die "dump 压缩包损坏"
  grep -q "mysql-bin\." /root/backups/pre-jar-$TS.binlog || die "位点文件无 binlog 文件名"
  log "备份就位：pre-jar-$TS.sql.gz + 位点 $(tail -1 /root/backups/pre-jar-$TS.binlog)"
fi

# ---------- M0.3 旧 jar 回滚包 ----------
run "mkdir -p $BASE/backup/$TS && cp -p $BASE/$JAR $BASE/backup/$TS/ && sha256sum $BASE/backup/$TS/$JAR > $BASE/backup/$TS/SHA256"

# ---------- M2 挂维护页 ----------
run "$MAINT on"
if [ "$APPLY" = 1 ]; then
  sleep 1
  C1=$(curl -s -o /dev/null -w '%{http_code}' https://cityretreat.fullyu.cn/api/product/get/list || true)
  [ "$C1" = "503" ] || die "维护页未生效（cityretreat 返回 $C1）"
  log "维护页已生效（503）"
fi

# ---------- M3 执行 SQL ----------
if [ "$APPLY" = 1 ]; then
  cd "$SQL_DIR"
  echo "== $PREREQ (顺序前置) $(date +%T)"
  mysql --defaults-extra-file=$CNF $DB < "$PREREQ" || die "SQL 失败: $PREREQ"
  for f in $(ls *.sql | grep -v customer-nickname-anonymize | grep -v "^$PREREQ$"); do
    echo "== $f $(date +%T)"
    mysql --defaults-extra-file=$CNF $DB < "$f" || die "SQL 失败: $f"
  done
  log "SQL 全部执行完成"
  if [ "$STOP_AFTER_SQL" = 1 ]; then
    log "M3 完成，按 --stop-after-sql 停：维护页保持 ON（线上 503）"
    log "下一步：跑 sql-audit.py 且必须 exit 0，通过后再执行 M5–M8"
    exit 0
  fi
fi

# ---------- M4 对账（0 缺失才继续） ----------
if [ "$APPLY" = 1 ]; then
  AFTER_MISSING=$(q "select count(*) from information_schema.tables where table_schema='$DB'")
  log "库表数：$BEFORE_MISSING → $AFTER_MISSING"
  [ "$AFTER_MISSING" -gt "$BEFORE_MISSING" ] || log "警告：表数未增（可能是纯列变更脚本），继续按手册 M4 用 sql-audit 复核"
fi

# ---------- M5 停旧 ----------
run "$BASE/stop-120.sh"
if [ "$APPLY" = 1 ]; then
  sleep 2
  pgrep -af "$JAR" && die "旧进程未退出（双 JVM 会导致 15 个 @Scheduled 重复跑）"
fi

# ---------- M6 换 jar ----------
run "cp -p $BASE/staging/$JAR $BASE/$JAR"
run "sha256sum $BASE/$JAR"

# ---------- M7 启动 ----------
[ -x "$BASE/start-120.sh.new" ] || die "缺少 start-120.sh.new"
run "$BASE/start-120.sh.new"
if [ "$APPLY" = 1 ]; then
  for i in $(seq 1 60); do
    if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:9929/api/product/get/list; then break; fi
    # 进程已死就别空等 3 分钟（2026-11-19：AK 未注入，进程 40 秒就死了，脚本还在等）
    pgrep -f "java .*$JAR" >/dev/null || die "进程已退出（启动失败），看 logs/ 最后 ERROR"
    sleep 3
    [ "$i" = 60 ] && die "启动 3 分钟未就绪，看 logs/"
  done
  log "9929 已就绪"
fi

# ---------- M8 撤维护页 ----------
run "$MAINT off"
if [ "$APPLY" = 1 ]; then
  sleep 1
  C2=$(curl -s -o /dev/null -w '%{http_code}' https://cityretreat.fullyu.cn/api/product/get/list || true)
  [ "$C2" = "200" ] || die "撤维护页后未 200（实际 $C2）"
  log "线上已 200"
fi

log "完成。回滚包：$BASE/backup/$TS"
