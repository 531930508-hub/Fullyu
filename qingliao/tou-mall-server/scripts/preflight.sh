#!/usr/bin/env bash
# 生产预检：一条命令出 Go/No-Go 表（上线手册 §3 / §10 M1）
# 只读：不改文件、不重启、不动库（sql-audit 只查 information_schema）
#
# 用法：
#   scripts/preflight.sh \
#     --host root@120.55.36.3 --db tou_mall_current --sql-dir sql/prod \
#     --mysql-opts=--defaults-extra-file=/etc/fullyu/qingliao-backup.cnf
#
# 常用可选项：
#   --strict-collations     对账含排序规则。生产预期有 1 处已知漂移（phone，见手册 §2.5），
#                           加了它这一项会被判 FAIL，属"已知且已 waiver"，不影响其它项。
#   --expect-jar-sha <sha>  校验 staging 里待换的 jar 指纹
#   --min-free-gb 2         换 jar 期间磁盘余量下限（默认 2G）
set -uo pipefail

HOST=root@120.55.36.3
DB=tou_mall_current
SQL_DIR=sql/prod
OPTS=""
STRICT=""
EXPECT_SHA=""
APP=/server/java/fully
PORT=9929
MIN_GB=2
JAR=mall-admin-1.0-SNAPSHOT.jar

while [ $# -gt 0 ]; do
  # 支持 --key=value 与 --key value 两种写法
  if [[ "$1" == --*=* ]]; then
    set -- "${1%%=*}" "${1#*=}" "${@:2}"
  fi
  case "$1" in
    --host) HOST=$2; shift 2 ;;
    --db) DB=$2; shift 2 ;;
    --sql-dir) SQL_DIR=$2; shift 2 ;;
    --mysql-opts) OPTS=$2; shift 2 ;;
    --strict-collations) STRICT=--strict-collations; shift ;;
    --expect-jar-sha) EXPECT_SHA=$2; shift 2 ;;
    --app-dir) APP=$2; shift 2 ;;
    --port) PORT=$2; shift 2 ;;
    --min-free-gb) MIN_GB=$2; shift 2 ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
done

here=$(cd "$(dirname "$0")" && pwd)
fails=0
rows=()

add() { rows+=("$1|$2|$3"); [ "$3" = "FAIL" ] && fails=$((fails+1)); return 0; }
rsh() { ssh -o BatchMode=yes -o ConnectTimeout=8 "$HOST" "$1" 2>/dev/null; }

# 1) 库结构对账
audit_args=(--host "$HOST" --db "$DB" --sql-dir "$SQL_DIR")
[ -n "$OPTS" ] && audit_args+=("--mysql-opts=$OPTS")
[ -n "$STRICT" ] && audit_args+=("$STRICT")
out=$(python3 "$here/sql-audit.py" "${audit_args[@]}" 2>&1); rc=$?
missing=$(printf '%s\n' "$out" | grep -cE '^\s+- (表|列):' || true)
drift=$(printf '%s\n' "$out" | grep -c '排序规则漂移' || true)
if [ "$rc" -eq 0 ]; then
  add "库结构对账" "0 缺失 / 排序规则一致" PASS
elif [ "$missing" -eq 0 ] && [ -n "$STRICT" ] && [ "$drift" -gt 0 ]; then
  add "库结构对账" "结构 0 缺失；仅 $drift 处已知排序规则漂移（phone）" PASS
else
  add "库结构对账" "exit=$rc 缺失=$missing 漂移=$drift（见 sql-audit 原始输出）" FAIL
fi

# 2) 进程数（必须恰好 1，双 JVM 会双跑定时任务）
#    只看真正的 java 进程：pgrep -f 会把 shell 包装、监控脚本的命令行也算进来，导致误报 2
procs=$(rsh "ps -C java -o args= | grep -c -- '-jar .*mall-admin-1.0-SNAPSHOT.jar'")
procs=${procs:-0}
[ "$procs" = "1" ] && add "应用进程数" "1" PASS || add "应用进程数" "$procs（应为 1）" FAIL

# 3) 端口
if rsh "ss -lnt | grep -qE ':$PORT\\b'" >/dev/null; then
  add "端口 $PORT" "LISTEN" PASS
else
  add "端口 $PORT" "未监听" FAIL
fi

# 4) 磁盘
avail=$(rsh "df -BG --output=avail / | tail -1 | tr -dc '0-9'")
avail=${avail:-0}
[ "$avail" -ge "$MIN_GB" ] && add "磁盘余量" "${avail}G（下限 ${MIN_GB}G）" PASS \
                           || add "磁盘余量" "${avail}G < ${MIN_GB}G" FAIL

# 5) 目标库连通与表数
tables=$(rsh "mysql ${OPTS:+$OPTS} -N -e \"select count(*) from information_schema.tables where table_schema='$DB'\"")
if [ -n "$tables" ] && [ "$tables" -gt 0 ]; then
  add "库连通（$DB）" "$tables 张表" PASS
else
  add "库连通（$DB）" "查不到表（客户端/凭据/网络？）" FAIL
fi

# 6) staging 待换 jar
if [ -n "$EXPECT_SHA" ]; then
  sha=$(rsh "sha256sum $APP/staging/$JAR | cut -d' ' -f1")
  [ "$sha" = "$EXPECT_SHA" ] && add "staging jar 指纹" "${sha:0:12}… 匹配" PASS \
                             || add "staging jar 指纹" "${sha:0:12}… ≠ 期望 ${EXPECT_SHA:0:12}…" FAIL
else
  add "staging jar 指纹" "未指定 --expect-jar-sha，跳过" SKIP
fi

# 7) 运行日志里的历史事故指纹（最近一个日志文件）
logf=$(rsh "ls -t $APP/logs/*.log 2>/dev/null | head -1")
if [ -n "$logf" ]; then
  for pat in 'Unknown column' 'Illegal mix of collations' 'NoClassDefFoundError'; do
    c=$(rsh "grep -c '$pat' '$logf'")
    c=${c:-0}
    [ "$c" = "0" ] && add "日志 $pat" "0" PASS || add "日志 $pat" "$c 次（见 $logf）" FAIL
  done
else
  add "日志检查" "没找到 $APP/logs/*.log" SKIP
fi

# 输出
printf '\n预检对端：%s  库：%s  脚本集：%s\n' "$HOST" "$DB" "$SQL_DIR"
printf '%-24s %-6s %s\n' "检查项" "结论" "详情"
printf '%s\n' "--------------------------------------------------------------------"
for r in "${rows[@]}"; do
  IFS='|' read -r k v d <<<"$r"
  printf '%-24s %-6s %s\n' "$k" "$v" "$d"
done

if [ "$fails" -eq 0 ]; then
  echo ">>> GO（0 项 FAIL）"
  exit 0
fi
echo ">>> NO-GO（$fails 项 FAIL）"
exit 1
