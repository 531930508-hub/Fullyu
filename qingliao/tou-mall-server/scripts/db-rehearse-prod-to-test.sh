#!/usr/bin/env bash
# 生产数据 → 测试库 演练（在测试机 121.40.119.57 上执行）
#
# 目的：把 tou_mall_current（阿里云 RDS，生产）的数据搬到测试机本地 MySQL 的
#       tou_mall_test，并执行 sql/ 里的幂等脚本对齐「新代码需要的 schema」，
#       完整演练一次上线时的数据迁移流程，事后可一键回滚。
#
# 为什么需要 schema 对齐：tou_mall_current 缺 30 张新表 + 20 个新列。只灌数据、
# 不补 DDL，新 jar 一启动 MyBatis-Plus 就会把新列拼进每条 SQL → 全站
# Unknown column（2026-11-11 birthday 事故的翻版）。所以验收标准是：
#   「生产数据 + sql/ 全部脚本」跑完后，schema 与替换前的测试库完全一致。
#
# 安全设计：
#   * 源库只读：mysqldump --single-transaction --skip-lock-tables，全 InnoDB（已核验），
#     不对生产加任何锁，不写任何一行。
#   * 硬守卫：目标库必须是 tou_mall_test；本机必须「有 tou_mall_test 且没有
#     tou_mall_current」——防止在错机器上把生产库当测试库 DROP。
#   * 先备份后覆盖：替换前把整个测试库 dump 成 gz，失败自动回滚。
#   * 数据校验：恢复后逐表 COUNT(*) 必须落在生产 dump 前后的区间内。
#
# 用法（在测试机上）：
#   ./db-rehearse-prod-to-test.sh --dry-run            # 只读检查和差异报告，不改任何东西
#   ./db-rehearse-prod-to-test.sh --confirm            # 正式演练（停机约 2~3 分钟）
#   ./db-rehearse-prod-to-test.sh --verify <时间戳>     # 演练后复核（只读）
#   ./db-rehearse-prod-to-test.sh --rollback <时间戳>   # 回到演练前的测试库
#
# 产物：$APP_DIR/backup/db-rehearsal/<时间戳>/
#   tou_mall_test-before.sql.gz   替换前测试库全量（回滚用）
#   prod-tou_mall_current.sql.gz  生产快照
#   schema-before/-prod/-postsql/-after.tsv  rows-*.tsv  sql-run.log  report.txt
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/fullyu-mall-test}"
SRC_DB="${SRC_DB:-tou_mall_current}"
DST_DB="${DST_DB:-tou_mall_test}"
RDS_CNF="${RDS_CNF:-$APP_DIR/.rds.cnf}"
SQL_DIR="${SQL_DIR:-$APP_DIR/src/tou-mall-server/sql}"
BK_ROOT="${BK_ROOT:-$APP_DIR/backup/db-rehearsal}"
START_SH="${START_SH:-$APP_DIR/start-backend.sh}"
HEALTH_URL="${HEALTH_URL:-https://test-cityretreat.fullyu.cn/api/shop/authorized}"
LOG_FILE="${LOG_FILE:-$APP_DIR/logs/app.log}"

MODE="plan"      # plan | confirm | rollback | verify
ARG_TS=""
for a in "$@"; do
  case "$a" in
    --confirm)  MODE="confirm" ;;
    --dry-run)  MODE="plan" ;;
    --rollback) MODE="ts-wait-rollback" ;;
    --verify)   MODE="ts-wait-verify" ;;
    -h|--help)  sed -n '2,30p' "$0"; exit 0 ;;
    *) case "$MODE" in
         ts-wait-rollback) ARG_TS="$a"; MODE="rollback" ;;
         ts-wait-verify)   ARG_TS="$a"; MODE="verify" ;;
         *) echo "未知参数: $a"; exit 1 ;;
       esac ;;
  esac
done

MYSQL_LOCAL=(mysql --default-character-set=utf8mb4)
MYSQL_SRC=(mysql --defaults-extra-file="$RDS_CNF" --default-character-set=utf8mb4)
DUMP_SRC=(mysqldump --defaults-extra-file="$RDS_CNF"
          --single-transaction --skip-lock-tables --quick
          --no-tablespaces --set-gtid-purged=OFF --hex-blob
          --default-character-set=utf8mb4 --routines --triggers --skip-events)
DUMP_LOCAL=(mysqldump --single-transaction --quick --no-tablespaces --hex-blob
            --default-character-set=utf8mb4 --routines --triggers --skip-events)

STEP=0; T0=$(date +%s)
step() { STEP=$((STEP + 1)); echo; echo "== $STEP. $1 =="; }
elapsed() { echo "$(( $(date +%s) - T0 ))s"; }
die() { echo "中止：$*" >&2; exit 1; }
pids() { ps -C java -o pid=,args= | awk '/mall-admin-1\.0-SNAPSHOT\.jar/ {print $1}'; }
# start-backend.sh 内部是 `exec setsid java`：直接调用时 java 会挂在调用方名下，
# 脚本会一直等它退出（2026-11-11 实测：卡在"启动"那步不返回）。用子 shell + & 脱离。
start_app() { ( cd "$APP_DIR" && nohup ./start-backend.sh >/dev/null 2>&1 & ); sleep 2; }

# 逐表 COUNT(*)：拼一条 UNION ALL，避免上百次 mysql 往返
counts() { # $1=local|src $2=schema $3=输出文件
  local kind="$1" db="$2" out="$3" sql="" t
  local -a M
  if [ "$kind" = "src" ]; then M=("${MYSQL_SRC[@]}"); else M=("${MYSQL_LOCAL[@]}"); fi
  "${M[@]}" -N -B -e "SELECT table_name FROM information_schema.tables
     WHERE table_schema='$db' AND table_type='BASE TABLE' ORDER BY 1" > "$BK/.tables.$kind"
  while IFS= read -r t; do
    [ -z "$t" ] && continue
    [ -n "$sql" ] && sql="$sql UNION ALL "
    sql="${sql}SELECT '$t' AS t, COUNT(*) AS n FROM \`$db\`.\`$t\`"
  done < "$BK/.tables.$kind"
  "${M[@]}" -N -B -e "SELECT t,n FROM ($sql) x ORDER BY t" > "$out"
}

schema() { # $1=local|src $2=schema $3=输出 — 表.列|类型
  local kind="$1" db="$2" out="$3"
  local -a M
  if [ "$kind" = "src" ]; then M=("${MYSQL_SRC[@]}"); else M=("${MYSQL_LOCAL[@]}"); fi
  "${M[@]}" -N -B -e "SELECT CONCAT(table_name,'.',column_name,'|',column_type)
     FROM information_schema.columns WHERE table_schema='$db' ORDER BY table_name,column_name" > "$out"
}

# ---------------------------------------------------------------- 校验函数
check_schema() { # 需要 $BK/schema-before.tsv（替换前基线）
  SCHEMA_OK=0
  schema local "$DST_DB" "$BK/schema-after.tsv"
  if ! python3 - "$BK/schema-before.tsv" "$BK/schema-after.tsv" <<'PY'
import sys,re
def load(p):
    d={}
    for line in open(p):
        k,v=line.strip().split('|',1); d[k]=v
    return d
tgt,now=load(sys.argv[1]),load(sys.argv[2])
skip=re.compile(r'_bak_|_backup_|_tmp$|_temp$',re.I)
tgt={k:v for k,v in tgt.items() if not skip.search(k.split('.',1)[0])}
now={k:v for k,v in now.items() if not skip.search(k.split('.',1)[0])}
missing=[k for k in tgt if k not in now]
mismatch=[(k,tgt[k],now[k]) for k in tgt if k in now and tgt[k]!=now[k]]
extra_t=sorted({k.split('.',1)[0] for k in now}-{k.split('.',1)[0] for k in tgt})
print(f"  对照替换前：目标 {len(tgt)} 列 / 现在 {len(now)} 列")
print(f"  缺失对象 {len(missing)}，类型不一致 {len(mismatch)}，多出表 {extra_t or '无'}")
for k in missing[:20]: print("    ✗ 缺:",k)
for k,a,b in mismatch[:20]: print(f"    ✗ 类型: {k} 目标={a} 实际={b}")
sys.exit(1 if missing or mismatch else 0)
PY
  then
    echo "  ⚠ schema 未完全对齐（见上），后端可能报 Unknown column"
  else
    echo "  ✅ schema 与替换前完全一致"
    SCHEMA_OK=1
  fi
}

check_app() { # $1=日志起始偏移（留空则看最后 3000 行）
  local offset="${1:-}"
  ok=0
  for i in $(seq 1 60); do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$HEALTH_URL" || true)
    if [ "$code" = "200" ]; then ok=1; echo "  健康检查 200（约 $((i*2))s）"; break; fi
    sleep 2
  done
  N=$(pids | wc -l)
  echo "  运行实例数：$N（应为 1）"
  sleep 2
  if [ -n "$offset" ]; then
    NEW_LOG=$(tail -c +$((offset + 1)) "$LOG_FILE" 2>/dev/null || true)
  else
    NEW_LOG=$(tail -n 3000 "$LOG_FILE" 2>/dev/null || true)
  fi
  ERR_COUNT=0
  if printf '%s' "$NEW_LOG" | grep -qE 'ERROR|Exception'; then
    ERR_COUNT=$(printf '%s' "$NEW_LOG" | grep -cE 'ERROR|Exception')
  fi
  echo "  启动后日志 ERROR/Exception：$ERR_COUNT 行"
  if [ "$ERR_COUNT" -gt 0 ]; then
    echo "  —— 首 8 行 ——"
    printf '%s' "$NEW_LOG" | grep -E 'ERROR|Exception' | head -8 | sed 's/^/    /'
  fi
}

write_report() { # $1=verify 时标为复核
  {
    echo "# 生产数据 → 测试库 $([ "${1:-}" = "verify" ] && echo 复核 || echo 演练)报告"
    echo
    echo "- 时间：$(date '+%F %T')"
    [ -n "${SRC_MB:-}" ] && echo "- 源：$SRC_DB @ $SRC_HOST（$SRC_TABLES 表 / $SRC_MB MB / read_only=${SRC_RO:-?}）"
    echo "- 目标：$DST_DB @ $LOCAL_HOST（替换前 ${DST_TABLES:-?} 表 → 现在 $("${MYSQL_LOCAL[@]}" -N -B -e \
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DST_DB' AND table_type='BASE TABLE'") 表）"
    echo "- sql/ 脚本失败数：${FAILED:-n/a}"
    echo "- schema 对齐：$([ "${SCHEMA_OK:-0}" = 1 ] && echo '与替换前一致 ✅' || echo '存在差异 ⚠️')"
    echo "- 健康检查：$([ "${ok:-0}" = 1 ] && echo '200 ✅' || echo '未就绪 ❌')，实例数 ${N:-?}，ERROR/Exception ${ERR_COUNT:-?} 行"
    echo
    echo "## 回滚"
    echo '```'
    echo "$(basename "$0") --rollback $TS"
    echo '```'
    echo
    echo "## 文件"
    ls -lh "$BK"
  } > "$BK/report.txt"
  sed -n '1,12p' "$BK/report.txt"
}

# ---------------------------------------------------------------- 前置：硬守卫
[ -f "$RDS_CNF" ] || die "找不到 $RDS_CNF（生产库凭据）"
[ -f "$START_SH" ] || die "找不到 $START_SH"
[ -d "$SQL_DIR" ] || die "找不到 $SQL_DIR"
command -v python3 >/dev/null || die "缺少 python3（schema 比对用）"
[ "$DST_DB" = "$SRC_DB" ] && die "源库与目标库相同（$SRC_DB）"

LOCAL_DBS=$("${MYSQL_LOCAL[@]}" -N -B -e 'SHOW DATABASES;')
grep -qx "$DST_DB" <<<"$LOCAL_DBS" || die "本机没有 $DST_DB，这里不是测试机？"
if grep -qx "$SRC_DB" <<<"$LOCAL_DBS"; then
  die "本机竟然有生产库 $SRC_DB —— 极可能连到了生产机，拒绝执行"
fi
"${MYSQL_SRC[@]}" -N -B -e 'SELECT 1;' >/dev/null || die "连不上生产库（$RDS_CNF）"
SRC_HOST=$("${MYSQL_SRC[@]}" -N -B -e 'SELECT @@hostname;')
LOCAL_HOST=$("${MYSQL_LOCAL[@]}" -N -B -e 'SELECT @@hostname;')
[ "$SRC_HOST" != "$LOCAL_HOST" ] || die "生产库与测试库同主机（$SRC_HOST），拒绝执行"

if [ "$MODE" = "ts-wait-rollback" ] || [ "$MODE" = "ts-wait-verify" ]; then
  die "$MODE 需要一个时间戳目录名"
fi

# ---------------------------------------------------------------- 回滚
if [ "$MODE" = "rollback" ]; then
  BK="$BK_ROOT/$ARG_TS"; TS="$ARG_TS"
  BACKUP="$BK/tou_mall_test-before.sql.gz"
  [ -f "$BACKUP" ] || die "找不到备份 $BACKUP"
  echo "回滚到 $ARG_TS 之前的测试库状态"
  P=$(pids); if [ -n "$P" ]; then echo "停止后端: $P"; kill $P 2>/dev/null || true
    for i in $(seq 1 15); do [ -z "$(pids)" ] && break; sleep 1; done
    L=$(pids); [ -n "$L" ] && { echo "强杀: $L"; kill -9 $L; sleep 2; }
  fi
  "${MYSQL_LOCAL[@]}" -e "DROP DATABASE IF EXISTS \`$DST_DB\`;
    CREATE DATABASE \`$DST_DB\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"
  zcat "$BACKUP" | "${MYSQL_LOCAL[@]}" --init-command='SET SESSION foreign_key_checks=0' "$DST_DB"
  start_app
  echo "已回滚并重启；用 --verify $ARG_TS 复核"
  exit 0
fi

# ---------------------------------------------------------------- 复核
if [ "$MODE" = "verify" ]; then
  BK="$BK_ROOT/$ARG_TS"; TS="$ARG_TS"
  [ -f "$BK/schema-before.tsv" ] || die "$BK 缺 schema-before.tsv，不是演练目录"
  echo "复核 $ARG_TS 的演练结果（只读）"
  check_schema
  check_app
  write_report verify
  [ "$ok" = 1 ] && [ "$N" = 1 ] && [ "$SCHEMA_OK" = 1 ] && exit 0
  exit 1
fi

# ---------------------------------------------------------------- 0. 只读盘点
step "0/8 只读盘点（不改任何数据）"
SRC_TABLES=$("${MYSQL_SRC[@]}" -N -B -e "SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema='$SRC_DB' AND table_type='BASE TABLE';")
DST_TABLES=$("${MYSQL_LOCAL[@]}" -N -B -e "SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema='$DST_DB' AND table_type='BASE TABLE';")
SRC_MB=$("${MYSQL_SRC[@]}" -N -B -e "SELECT ROUND(SUM(data_length+index_length)/1024/1024,1)
  FROM information_schema.tables WHERE table_schema='$SRC_DB';")
SRC_RO=$("${MYSQL_SRC[@]}" -N -B -e 'SELECT @@read_only;')
FREE_GB=$(df -BG --output=avail "$APP_DIR" | tail -1 | tr -dc '0-9')
echo "源  $SRC_DB @ $SRC_HOST：${SRC_TABLES} 表 / ${SRC_MB} MB / read_only=$SRC_RO"
echo "目标 $DST_DB @ $LOCAL_HOST：${DST_TABLES} 表"
echo "磁盘余量：${FREE_GB} GB"
[ "$SRC_TABLES" -ge 100 ] || die "源库表数异常（$SRC_TABLES）"
[ "$FREE_GB" -ge 2 ] || die "磁盘余量不足（需 ≥2 GB）"
if pgrep -x mvn >/dev/null; then die "检测到 mvn 在跑（Jenkins/手动发布），等它结束再演练"; fi

TS=$(date +%Y%m%d-%H%M%S)
BK="$BK_ROOT/$TS"
mkdir -p "$BK"

echo "采集：替换前 schema 基线 + 生产行数快照"
schema local "$DST_DB" "$BK/schema-before.tsv"
schema src   "$SRC_DB" "$BK/schema-prod.tsv"
counts src   "$SRC_DB" "$BK/rows-prod-a.tsv"

# 差异预览
python3 - "$BK/schema-prod.tsv" "$BK/schema-before.tsv" <<'PY'
import re,sys
def load(p):
    d={}
    for line in open(p):
        k,v=line.strip().split('|',1); d[k]=v
    return d
skip=re.compile(r'_bak_|_backup_|_tmp$|_temp$',re.I)
prod,tgt=load(sys.argv[1]),load(sys.argv[2])
strip=lambda d:{k:v for k,v in d.items() if not skip.search(k.split('.',1)[0])}
prod,tgt=strip(prod),strip(tgt)
prod_t={k.split('.',1)[0] for k in prod}
tgt_t={k.split('.',1)[0] for k in tgt}
new_t=sorted(tgt_t-prod_t)
miss_c=sorted(k for k in tgt if k not in prod and k.split('.',1)[0] in prod_t)
print(f"  生产缺新表 {len(new_t)} 张 / 公共表上缺新列 {len(miss_c)} 个（恢复后由 sql/ 补齐）")
print(f"  缺列：{', '.join(miss_c) or '无'}")
print(f"  生产独有表 {len(prod_t-tgt_t)} 张：{', '.join(sorted(prod_t-tgt_t)) or '无'}（恢复后会留下，无害）")
PY

if [ "$MODE" = "plan" ]; then
  echo
  echo "--dry-run：只读检查通过，未做任何修改。正式演练请加 --confirm"
  exit 0
fi

# ---------------------------------------------------------------- 1. 备份测试库
step "1/8 备份当前测试库（回滚用）"
"${DUMP_LOCAL[@]}" "$DST_DB" | gzip > "$BK/tou_mall_test-before.sql.gz"
gzip -t "$BK/tou_mall_test-before.sql.gz" || die "测试库备份损坏"
echo "  $(du -h "$BK/tou_mall_test-before.sql.gz" | cut -f1) → $BK/tou_mall_test-before.sql.gz"

# ---------------------------------------------------------------- 2. 拉生产快照
step "2/8 只读拉取生产快照（--single-transaction，不加锁）"
"${DUMP_SRC[@]}" "$SRC_DB" | gzip > "$BK/prod-$SRC_DB.sql.gz"
gzip -t "$BK/prod-$SRC_DB.sql.gz" || die "生产快照损坏"
DUMP_TABLES=$(zcat "$BK/prod-$SRC_DB.sql.gz" | grep -c '^CREATE TABLE')
DUMP_USE=$(zcat "$BK/prod-$SRC_DB.sql.gz" | grep -cE '^(USE |CREATE DATABASE)' || true)
echo "  $(du -h "$BK/prod-$SRC_DB.sql.gz" | cut -f1)，CREATE TABLE ${DUMP_TABLES} 个，USE/CREATE DATABASE 语句 ${DUMP_USE} 条"
[ "$DUMP_TABLES" = "$SRC_TABLES" ] || die "快照表数 $DUMP_TABLES ≠ 源库 $SRC_TABLES"
[ "$DUMP_USE" = "0" ] || die "快照里带库切换语句，导入可能写错库"
counts src "$SRC_DB" "$BK/rows-prod-b.tsv"

# ---------------------------------------------------------------- 3. 停应用
step "3/8 停止测试后端（避免恢复期间写入）"
P=$(pids)
if [ -z "$P" ]; then echo "  无运行实例"; else
  echo "  停止: $P"; kill $P 2>/dev/null || true
  for i in $(seq 1 15); do [ -z "$(pids)" ] && break; sleep 1; done
  L=$(pids); if [ -n "$L" ]; then echo "  SIGTERM 无效，强杀: $L"; kill -9 $L; sleep 2; fi
fi
[ -z "$(pids)" ] || die "后端未停干净"
LOG_OFFSET=$(stat -c %s "$LOG_FILE" 2>/dev/null || echo 0)

# ---------------------------------------------------------------- 4. 替换
step "4/8 重建 $DST_DB 并导入生产快照"
"${MYSQL_LOCAL[@]}" -e "DROP DATABASE IF EXISTS \`$DST_DB\`;
  CREATE DATABASE \`$DST_DB\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
rollback_now() {
  echo "导入失败，自动回滚测试库…" >&2
  "${MYSQL_LOCAL[@]}" -e "DROP DATABASE IF EXISTS \`$DST_DB\`;
    CREATE DATABASE \`$DST_DB\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"
  zcat "$BK/tou_mall_test-before.sql.gz" | "${MYSQL_LOCAL[@]}" "$DST_DB"
  start_app
  die "演练失败，已回滚并重启。备份：$BK"
}
zcat "$BK/prod-$SRC_DB.sql.gz" \
  | "${MYSQL_LOCAL[@]}" --init-command='SET SESSION foreign_key_checks=0, SESSION unique_checks=0' "$DST_DB" \
  || rollback_now
NEW_TABLES=$("${MYSQL_LOCAL[@]}" -N -B -e "SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema='$DST_DB' AND table_type='BASE TABLE';")
echo "  导入完成，表数 $NEW_TABLES（应为 $SRC_TABLES）"
[ "$NEW_TABLES" = "$SRC_TABLES" ] || rollback_now

# ---------------------------------------------------------------- 5. 数据校验
step "5/8 逐表校验行数（必须落在生产 dump 前后的区间内）"
[ -z "$(pids)" ] || rollback_now
counts local "$DST_DB" "$BK/rows-restored.tsv"
if ! awk -F'\t' '
  FILENAME==ARGV[1]{a[$1]=$2;next}
  FILENAME==ARGV[2]{b[$1]=$2;next}
  {r[$1]=$2}
  END{
    bad=0; checked=0
    for (t in r) {
      lo = (t in a) ? a[t]+0 : 0
      hi = (t in b) ? b[t]+0 : lo
      checked++
      if (r[t]+0 < lo || r[t]+0 > hi) { printf "  ✗ %s 恢复=%s 生产区间=[%s,%s]\n", t, r[t], lo, hi; bad++ }
    }
    printf "  校验 %d 张表，不一致 %d 张\n", checked, bad
    exit (bad>0)
  }' "$BK/rows-prod-a.tsv" "$BK/rows-prod-b.tsv" "$BK/rows-restored.tsv"; then
  rollback_now
fi
# 关键业务表显式对账
"${MYSQL_LOCAL[@]}" -N -B -e "
  SELECT CONCAT('  ',table_name,' = ',table_rows) FROM information_schema.tables
  WHERE table_schema='$DST_DB' AND table_name IN
  ('c_customer','s_order','oms_order_detail','s_round_schedule','ums_admin','f_approval');" || true

# ---------------------------------------------------------------- 6. 对齐 schema
step "6/8 执行 sql/ 幂等脚本，把 schema 对齐到新代码需要的状态"
schema local "$DST_DB" "$BK/schema-restored.tsv"
RUN_LOG="$BK/sql-run.log"
: > "$RUN_LOG"
FAILED=0
while IFS= read -r f; do
  name=$(basename "$f")
  if out=$("${MYSQL_LOCAL[@]}" "$DST_DB" < "$f" 2>&1); then
    printf '  ok    %s\n' "$name" | tee -a "$RUN_LOG"
  else
    FAILED=$((FAILED + 1))
    printf '  FAIL  %s\n        %s\n' "$name" "${out//$'\n'/$'\n'        }" | tee -a "$RUN_LOG"
  fi
done < <(find "$SQL_DIR" -maxdepth 1 -name '*.sql' | sort)
echo "  脚本 $(find "$SQL_DIR" -maxdepth 1 -name '*.sql' | wc -l) 个，失败 $FAILED 个（详见 $RUN_LOG）"

schema local "$DST_DB" "$BK/schema-postsql.tsv"
check_schema

# ---------------------------------------------------------------- 7. 起应用
step "7/8 启动测试后端并健康检查"
if pgrep -x mvn >/dev/null; then
  echo "  ⚠ 有 mvn 在跑（可能是 Jenkins/手动构建），jar 可能被替换"
fi
start_app
check_app "$LOG_OFFSET"

# ---------------------------------------------------------------- 8. 报告
step "8/8 生成报告"
write_report

echo
if [ "$ok" = 1 ] && [ "$N" = 1 ] && [ "$SCHEMA_OK" = 1 ]; then
  echo "✅ 演练完成（$(elapsed)）。备份与报告：$BK"
  exit 0
fi
echo "⚠ 演练完成但有异常，先看 $BK/report.txt 和 $APP_DIR/logs/app.log"
echo "  回滚：$0 --rollback $TS"
exit 1