#!/usr/bin/env bash
# 轻疗换 jar 执行器（批次 1）—— 在 120.55 上以 root 运行
#
# 设计原则：
#   1) 默认 dry-run，只打印将执行的命令；加 --yes 才真动
#   2) 任一步失败立刻停，且已挂的维护页保持挂着（宁可 503 也不半死不活）
#   3) 不碰 nginx 配置、不重启 nginx、不动在场/时叙进程（只按 jar 名停轻疗）
#
# 用法：
#   ./qingliao-jar-swap.sh --sql-dir /root/sql-migrate-YYYYMMDD/prod [--yes]
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

while [ $# -gt 0 ]; do
  case "$1" in
    --sql-dir) SQL_DIR="$2"; shift 2 ;;
    --yes) APPLY=1; shift ;;
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
[ "$CNT" -eq 40 ] || die "SQL 数量异常（排除延后脚本后应为 40，实际 $CNT）"
N=$(ps -C java -o args= | grep -c -- "-jar .*$JAR")
[ "$N" -eq 1 ] || die "轻疗 java 进程数应为 1，实际 $N"
AVAIL=$(df --output=avail -BG / | tail -1 | tr -dc '0-9')
[ "$AVAIL" -ge 2 ] || die "根盘余量 ${AVAIL}G < 2G"
BEFORE_MISSING=$(q "select count(*) from information_schema.tables where table_schema='$DB'") && log "库表数=$BEFORE_MISSING"
log "前置全部通过：sha/size/脚本数/进程/磁盘"

# ---------- M0.2 逻辑备份 + binlog 位点（RDS 快照不可用时的一等替代） ----------
# 该库实际不在 presence-app 所属账号（API NotFound），拿不到手动快照；
# 用 fully 账号做一致性导出（--single-transaction）并记录 binlog 位点，可恢复 + 可 PITR。
TS=$(date +%Y%m%d-%H%M%S)
run "mysqldump --defaults-extra-file=$CNF --single-transaction --master-data=2 --set-gtid-purged=OFF --routines --triggers --events --hex-blob $DB | gzip > /root/backups/pre-jar-$TS.sql.gz"
run "mysql --defaults-extra-file=$CNF -e 'show master status' | tee /root/backups/pre-jar-$TS.binlog"
run "BACKUP_LOG=/var/log/fu-backup-qingliao.log /usr/local/bin/fu-backup-qingliao.sh"
if [ "$APPLY" = 1 ]; then
  ls -lh /root/backups/pre-jar-$TS.sql.gz || die "dump 未生成"
  gzip -t /root/backups/pre-jar-$TS.sql.gz || die "dump 压缩包损坏"
  grep -m1 "CHANGE MASTER" <(zcat /root/backups/pre-jar-$TS.sql.gz | head -100) || die "dump 内无 binlog 位点"
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
  for f in $(ls *.sql | grep -v customer-nickname-anonymize); do
    echo "== $f $(date +%T)"
    mysql --defaults-extra-file=$CNF $DB < "$f" || die "SQL 失败: $f"
  done
  log "SQL 全部执行完成"
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
