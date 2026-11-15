#!/usr/bin/env bash
# 测试环境一键发布（2026-11-11 实测跑通）
#
# 测试机是"源码在服务器上、就地 mvn 打包"的模式：
#   源码  /opt/fullyu-mall-test/src/tou-mall-server
#   jar   .../mall-admin/target/mall-admin-1.0-SNAPSHOT.jar
#   启动  /opt/fullyu-mall-test/start-backend.sh（端口 19929）
#
# 四个真实故障，脚本里都堵住了：
#   1) 边跑边就地打包 → 运行中 JVM 懒加载类失败 → 随机接口 500
#      （实测 NoClassDefFoundError: ModelAndViewDefiningException，/shop/list 500）
#      ⇒ 先停应用，再打包
#   2) -Dfullyu.test-mode 下 SIGTERM 不生效 → 双 JVM 并存、定时任务重复
#      ⇒ TERM 等 15 秒后 kill -9，并断言只剩 1 个实例
#   3) pgrep -f 会把"命令行里含 jar 名"的 shell（含执行本脚本的 ssh 会话）一起匹配
#      ⇒ 只用 ps -C java 取 java 进程再按 jar 名过滤
#   4) 代码比库新：实体加了字段、sql/ 脚本忘了执行 → MyBatis-Plus 把新字段拼进
#      每条 SQL，全站 Unknown column（2026-11-11 birthday 事故：搜手机号、
#      首页今日服务安排、定时任务一起挂）⇒ 发布前跑 scripts/sql-audit.py 对账
#   5) 对账目标写死：sql-audit.py 的 --db 默认 tou_mall_test，config/ 一旦把应用
#      指到别的库，就会对着「没人用的库」绿灯放行（2026-11-11 核对：RDS 的
#      tou_mall_demo 缺 83 个对象，而运行库其实是本机 tou_mall_test）
#      ⇒ 对账库改为从 start-backend.sh + config/ 解析运行配置，识别不到就中止
#   6) 排序规则漂移：11-11 13:44 测试库从 RDS 导出重建，导入表是
#      utf8mb4_0900_ai_ci、sql/ 建的 s_stat_internal_account 是 general_ci →
#      `ia.phone = TRIM(c.phone)` 抛 1267，激励中心整页 500。「表/列都在」挡不住
#      ⇒ 对账同时体检比较列排序规则，**默认拦截**（--allow-collation-drift 降级为告警）
#      11-11 已把 tou_mall_test 全库统一到 utf8mb4_0900_ai_ci（158 张表 / 466 个字符串列，
#      备份 backup/db/tou_mall_test-20261111-1546.sql.gz），sql/ 声明同步改齐
#
#   ./scripts/deploy-test.sh              # 对账 → 同步 → 停 → 打包 → 启动 → 健康检查
#   ./scripts/deploy-test.sh --with-web    # 同上 + 管理端前端构建/发布
#   ./scripts/deploy-test.sh --no-sync     # 源码没变，只重建重启
#   ./scripts/deploy-test.sh --status      # 不发布，只看版本/进程/开关/前端/运行库
#   ./scripts/deploy-test.sh --allow-collation-drift  # 排序规则漂移只告警不拦截
#   ./scripts/deploy-test.sh --skip-sql-audit         # 跳过库对账（确认过才用）
#
# --with-web：本机 `npm run build:test`（BASE_API=https://mall-test.fullyu.cn/api），
#   产物先备份远端 admin-dist，再 rsync 覆盖 `/mall-admin/`，并校验首页引用新 app.js。
#
#   7) 「停完没起来」：20:54 那次中断把应用停了 40 分钟、全站 502，只有一小时一次的
#      巡检报警（2026-11-13 实测）⇒ 本脚本装了 EXIT trap：只要进入「已停服」阶段后
#      任何一步失败/Ctrl-C，都会恢复备份 jar 并重新拉起；后端已就绪而前端失败则回滚
#      admin-dist。发布期间写 $APP_DIR/.deploy.lock，避免和 bin/backend-guard.sh 抢。
set -euo pipefail

HOST="${DEPLOY_HOST:-mall-test}"
APP_DIR="${APP_DIR:-/opt/fullyu-mall-test}"
SRC_REMOTE="$APP_DIR/src/tou-mall-server"
JAR_REMOTE="$SRC_REMOTE/mall-admin/target/mall-admin-1.0-SNAPSHOT.jar"
HEALTH_URL="${HEALTH_URL:-https://mall-test.fullyu.cn/api/shop/authorized}"
START_SH="$APP_DIR/start-backend.sh"

cd "$(dirname "$0")/.."
SRV="$(cd .. && pwd)"

WEB_DIR="${WEB_DIR:-$SRV/tou-mall-admin-web}"
WEB_REMOTE="$APP_DIR/admin-dist"
WEB_HEALTH_URL="${WEB_HEALTH_URL:-https://mall-test.fullyu.cn/mall-admin/}"

SYNC=1; STATUS_ONLY=0; WEB=0; SKIP_AUDIT=0; STRICT="--strict-collations"
for a in "$@"; do
  case "$a" in
    --no-sync) SYNC=0 ;;
    --status)  STATUS_ONLY=1 ;;
    --with-web) WEB=1 ;;
    --skip-sql-audit) SKIP_AUDIT=1 ;;
    --strict-collations) STRICT="--strict-collations" ;;
    --allow-collation-drift) STRICT="" ;;
    *) echo "未知参数: $a"; exit 1 ;;
  esac
done

STEP_TOTAL=6
if [ "$WEB" = 1 ]; then STEP_TOTAL=9; fi
STEP_NO=0
step() { STEP_NO=$((STEP_NO + 1)); echo "== $STEP_NO/$STEP_TOTAL $1 =="; }

# 远端公共片段：只挑 java 进程，避免匹配到 shell 自身
RC='APP_DIR="$1"; JAR_REMOTE="$2"; START_SH="$3"
pids() { ps -C java -o pid=,args= | awk "/mall-admin-1\\.0-SNAPSHOT\\.jar/ {print \$1}"; }'

# 解析「应用实际连哪个库」：start-backend.sh 的 profile → config/application-<profile>.yml
# （Spring 优先级最高）→ config/application.yml → $APP_DIR/application*.yml → jar 内 application*.yml
# 输出 PROFILE= / SRC= / HOSTPORT= / DB=  四行，识别不到时只有 PROFILE=
runtime_db() {
  ssh "$HOST" python3 - "$APP_DIR" "$START_SH" "$JAR_REMOTE" <<'PY'
import os, re, sys, zipfile
app, start_sh, jar = sys.argv[1], sys.argv[2], sys.argv[3]
prof = 'test'
try:
    m = re.search(r'spring\.profiles\.active[=:]\s*([A-Za-z0-9_,-]+)',
                  open(start_sh, errors='ignore').read())
    if m:
        prof = m.group(1).split(',')[0]
except OSError:
    pass
print('PROFILE=' + prof)
pat = re.compile(r'url:\s*jdbc:mysql://([^/\s]+)/([A-Za-z0-9_]+)')
cands = [f'{app}/config/application-{prof}.yml', f'{app}/config/application.yml',
         f'{app}/application-{prof}.yml', f'{app}/application.yml']
found = None
for c in cands:
    if os.path.exists(c):
        mm = pat.search(open(c, errors='ignore').read())
        if mm:
            found = (c, mm.group(1), mm.group(2))
            break
if not found and os.path.exists(jar):
    try:
        z = zipfile.ZipFile(jar)
        for n in (f'BOOT-INF/classes/application-{prof}.yml', 'BOOT-INF/classes/application.yml'):
            if n in z.namelist():
                mm = pat.search(z.read(n).decode('utf-8', 'ignore'))
                if mm:
                    found = ('jar:' + n, mm.group(1), mm.group(2))
                    break
    except Exception:
        pass
if found:
    print('SRC=' + found[0])
    print('HOSTPORT=' + found[1])
    print('DB=' + found[2])
PY
}

# ---------- --status ----------
if [ "$STATUS_ONLY" = 1 ]; then
  ssh "$HOST" bash -s -- "$APP_DIR" "$JAR_REMOTE" "$START_SH" <<REMOTE
set -uo pipefail
$RC
echo "== jar =="; ls -l --time-style=+%m-%d_%H:%M "\$JAR_REMOTE" || echo 缺 jar
echo "== 进程 =="; P=\$(pids); if [ -n "\$P" ]; then ps -C java -o pid=,lstart=,args= | grep 'mall-admin-1.0-SNAPSHOT' | cut -c1-90; else echo 未运行; fi
echo "== 端口 =="; ss -lntp 2>/dev/null | grep 19929 | head -1 || echo 未监听
echo "== 开关 =="; grep -E 'SHOP_SCOPE|INCENTIVE_TEAM' "\$START_SH" || echo '未显式设置（走 application.yml 默认）'
echo "== 构建中 =="; pgrep -c mvn || echo 无
echo "== 最近备份 =="; ls -t "\$APP_DIR/backup" 2>/dev/null | head -3
echo "== 前端 =="; ls -l --time-style=+%m-%d_%H:%M "$APP_DIR/admin-dist/index.html" 2>/dev/null || echo 缺 dist
grep -o 'static/js/app\.[a-z0-9]*\.js' "$APP_DIR/admin-dist/index.html" 2>/dev/null | head -1 || true
REMOTE
  RT_DB="$(runtime_db | sed -n 's/^DB=//p' | head -1)"
  echo "== 运行库 =="; echo "${RT_DB:-未识别（config/ 里没解析到 jdbc url）}"
  exit 0
fi

TS="$(date +%Y%m%d-%H%M)"
BK="$APP_DIR/backup/deploy-$TS"

# ---------- 发布状态与异常兜底 ----------
# 2026-11-13 20:54 事故：脚本停掉应用后没走到「启动」就中断，测试环境 502 挂了 40 分钟，
# 只有一小时一次的巡检发现。这里的 EXIT trap 保证「停过就必须起来」：
#   PHASE=stopped（已停未起）失败 → 恢复备份 jar 并立刻拉起
#   PHASE=started（后端已就绪）失败 → 回滚前端 admin-dist
# 同时写 .deploy.lock，让 bin/backend-guard.sh（每 2 分钟）在发布期间不要抢着拉起。
PHASE="init"
LOCK_REMOTE="$APP_DIR/.deploy.lock"

rollback_backend() {
  ssh "$HOST" bash -s -- "$APP_DIR" "$JAR_REMOTE" "$START_SH" "$BK" <<'REMOTE'
set -uo pipefail
APP_DIR="$1"; JAR_REMOTE="$2"; START_SH="$3"; BK="$4"
pids() { ps -C java -o pid=,args= | awk "/mall-admin-1\\.0-SNAPSHOT\\.jar/ {print \$1}"; }
if [ -n "$(pids)" ]; then echo "已有实例在跑，无需回滚启动"; exit 0; fi
if [ -f "$BK/mall-admin-1.0-SNAPSHOT.jar" ]; then
  cp -a "$BK/mall-admin-1.0-SNAPSHOT.jar" "$JAR_REMOTE" && echo "已恢复备份 jar"
else
  echo "没有备份 jar，直接用当前 jar 启动"
fi
cd "$APP_DIR" || exit 1
# 必须做二次 fork 的后台启动：start-backend.sh 里 exec 出来的 JVM 若是这里的子进程，
# 这个 bash -s 会一直等它，ssh 通道不关闭、本地发布脚本卡死（2026-11-13 实测）
( setsid --fork nohup ./"$(basename "$START_SH")" >>"$APP_DIR/logs/app.log" 2>&1 </dev/null & )
sleep 1
echo "已触发启动，等待健康检查"
REMOTE
}

on_exit() {
  rc=$?
  ssh "$HOST" "rm -f '$LOCK_REMOTE'" >/dev/null 2>&1 || true
  if [ "$rc" -eq 0 ]; then return 0; fi
  case "$PHASE" in
    stopped)
      echo
      echo "== 发布中断（已停服、未启动）：自动恢复备份 jar 并拉起后端 =="
      rollback_backend || echo "自动拉起命令自身失败，请手动执行：ssh $HOST 'cd $APP_DIR && ./start-backend.sh'"
      ok2=0
      for i in $(seq 1 60); do
        c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$HEALTH_URL" || true)
        if [ "$c" = "200" ]; then ok2=1; echo " → 200（约 $((i*2))s）"; break; fi
        sleep 2
      done
      if [ "$ok2" = 1 ]; then
        echo "后端已恢复到发布前状态。"
      else
        echo "⚠️  自动拉起后健康检查仍未通过，立即人工介入：ssh $HOST 'tail -50 $APP_DIR/logs/app.log'"
      fi
      ;;
    started)
      echo
      echo "== 发布中断（后端已就绪、前端步骤失败）：回滚 admin-dist =="
      ssh "$HOST" "if [ -f '$BK/admin-dist.tgz' ]; then rm -rf '$WEB_REMOTE' && tar xzf '$BK/admin-dist.tgz' -C '$APP_DIR' && echo 'admin-dist 已回滚'; else echo '没有前端备份包，跳过回滚'; fi" || true
      ;;
  esac
  return 0
}
trap on_exit EXIT
ssh "$HOST" "touch '$LOCK_REMOTE'" 2>/dev/null || true

# ---------- 0. 运行库对账（防 Unknown column / 排序规则漂移） ----------
if [ "$SKIP_AUDIT" = 1 ]; then
  step "跳过 SQL 预检（--skip-sql-audit）"
elif ! command -v python3 >/dev/null 2>&1; then
  step "SQL 预检（本机无 python3，跳过）"
else
  step "SQL 预检：运行库对账"
  RT="$(runtime_db || true)"
  RT_DB="$(printf '%s\n' "$RT" | sed -n 's/^DB=//p' | head -1)"
  RT_SRC="$(printf '%s\n' "$RT" | sed -n 's/^SRC=//p' | head -1)"
  RT_HP="$(printf '%s\n' "$RT" | sed -n 's/^HOSTPORT=//p' | head -1)"
  RT_PROF="$(printf '%s\n' "$RT" | sed -n 's/^PROFILE=//p' | head -1)"
  echo "profile=${RT_PROF:-?}  运行库=${RT_DB:-未识别}（${RT_HP:-?}）  来源=${RT_SRC:-?}"

  if [ -z "$RT_DB" ]; then
    echo
    echo "发布中止：无法从运行配置解析数据源，没法确认库结构。"
    echo "已检查 start-backend.sh 的 profile 与 config/application*.yml、jar 内 application*.yml。"
    echo "确认这次无需对账可加 --skip-sql-audit 强行发布。"
    exit 1
  fi

  if [ -n "${SQL_DB:-}" ] && [ "$SQL_DB" != "$RT_DB" ]; then
    echo "⚠️  SQL_DB=$SQL_DB 与运行库 $RT_DB 不一致，请确认这是你想要的"
  fi
  AUDIT_DB="${SQL_DB:-$RT_DB}"

  # 登录凭据：本机 MySQL 用 .db.cnf，远端 RDS 用 .rds.cnf；都没有则回落到远端默认凭据
  case "$RT_HP" in
    127.0.0.1*|localhost*) RT_CNF="$APP_DIR/.db.cnf" ;;
    *) RT_CNF="$APP_DIR/.rds.cnf" ;;
  esac
  if ssh "$HOST" "test -f '$RT_CNF'" 2>/dev/null; then
    MO="--mysql-opts=--defaults-extra-file=$RT_CNF"
  else
    MO="" ; echo "未找到 $RT_CNF，改用远端默认 mysql 凭据"
  fi

  if ! ./scripts/sql-audit.py --host "$HOST" --db "$AUDIT_DB" $MO $STRICT; then
    echo
    echo "发布中止：运行库 $AUDIT_DB 与 sql/ 不一致（缺表/缺列，或 --strict-collations 下排序规则漂移）。"
    echo "这批代码上线后会报 Unknown column 或 1267 Illegal mix of collations。"
    echo "先执行上面列出的 SQL 脚本（均带幂等守卫）/ 修掉脚本里的跨库比较，再重跑；"
    echo "确认这次无需对账时可加 --skip-sql-audit 强行发布。"
    exit 1
  fi
fi

# ---------- 0(可选). 本机构建管理端前端 ----------
if [ "$WEB" = 1 ]; then
  step "构建管理端前端（本机 npm run build:test）"
  [ -f "$WEB_DIR/package.json" ] || { echo "找不到前端工程: $WEB_DIR"; exit 1; }
  [ -d "$WEB_DIR/node_modules" ] || { echo "缺少 node_modules，请先: cd $WEB_DIR && npm ci"; exit 1; }
  ( cd "$WEB_DIR" && npm run build:test ) | tail -5
  [ -f "$WEB_DIR/dist/index.html" ] || { echo "前端构建产物缺失: $WEB_DIR/dist/index.html"; exit 1; }
fi

# ---------- 1. 同步源码 ----------
if [ "$SYNC" = 1 ]; then
  step "rsync 源码"
  rsync -az --delete \
    --exclude '.git' --exclude 'node_modules' --exclude 'target' --exclude 'dist' \
    --exclude 'logs' --exclude '*.log' \
    "$SRV/tou-mall-server/" "$HOST:$SRC_REMOTE/"
else
  step "跳过源码同步"
fi

# ---------- 2. 备份 + 停应用 ----------
step "备份 jar、停应用"
ssh "$HOST" bash -s -- "$APP_DIR" "$JAR_REMOTE" "$START_SH" "$BK" <<REMOTE
set -uo pipefail
$RC
BK="\$4"
mkdir -p "\$BK"
if [ -f "\$JAR_REMOTE" ]; then cp -a "\$JAR_REMOTE" "\$BK/" && echo "已备份到 \$BK"; else echo "没有可备份的 jar"; fi
P=\$(pids)
if [ -z "\$P" ]; then echo "没有运行中的实例"; exit 0; fi
echo "停止旧进程: \$P"
kill \$P 2>/dev/null || true
for i in \$(seq 1 15); do if [ -z "\$(pids)" ]; then break; fi; sleep 1; done
L=\$(pids)
if [ -n "\$L" ]; then echo "SIGTERM 无效，强杀: \$L"; kill -9 \$L; sleep 2; fi
R=\$(pids)
if [ -z "\$R" ]; then echo "已停止"; else echo "停止失败: \$R"; exit 1; fi
REMOTE

# 从这里起应用是停的：之后任何失败都会走 on_exit 的自动回滚
PHASE="stopped"

# ---------- 3. 打包 ----------
step "mvn package（服务器上，60~120s）"
ssh "$HOST" bash -s -- "$SRC_REMOTE" "$JAR_REMOTE" <<'REMOTE'
set -uo pipefail
cd "$1" || exit 1
mvn -q -pl mall-admin -am -DskipTests clean package 2>&1 | tail -25
rc=${PIPESTATUS[0]}
echo "build-exit: $rc"
[ "$rc" = 0 ] || exit "$rc"
ls -l --time-style=+%m-%d_%H:%M "$2"
REMOTE

# ---------- 4. 启动 ----------
step "启动"
# setsid --fork 二次 fork：前台/普通 & 都会让 ssh 一直等这个 JVM，脚本卡死在这一步
ssh "$HOST" "cd $(dirname "$START_SH") && setsid --fork nohup ./$(basename "$START_SH") >>$APP_DIR/logs/app.log 2>&1 </dev/null & sleep 1; echo 已触发启动"

# ---------- 5. 健康检查 ----------
step "健康检查"
echo -n "等待就绪"
ok=0
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$HEALTH_URL" || true)
  if [ "$code" = "200" ]; then ok=1; echo " → 200（约 $((i*2))s）"; break; fi
  echo -n "."; sleep 2
done

n=$(ssh "$HOST" bash -s -- "$APP_DIR" "$JAR_REMOTE" "$START_SH" <<REMOTE
set -uo pipefail
$RC
count() { pids | awk 'NF' | wc -l; }
# start-backend.sh 里的 setsid 会 fork，偶发一次发布拉起两个 JVM（2026-11-13 18:37 实测），
# 这里收敛到「启动时间最新」的那个，其余强杀，避免双实例跑定时任务。
if [ "\$(count)" -gt 1 ]; then
  P=\$(pids)
  KEEP=\$(ps -C java -o pid=,etimes=,args= | awk '/mall-admin-1\\.0-SNAPSHOT\\.jar/ {print \$2, \$1}' | sort -n | head -1 | awk '{print \$2}')
  echo "检测到多实例，保留最新进程 \$KEEP，清理其余" >&2
  for p in \$P; do [ "\$p" = "\$KEEP" ] || kill -9 "\$p" 2>/dev/null || true; done
  sleep 2
fi
count
REMOTE
)
echo "运行中实例数: ${n}（应为 1）"

if [ "$ok" != 1 ] || [ "$n" != "1" ]; then
  echo
  echo "发布异常，先清掉残留实例，再由 on_exit 恢复备份 jar 并重新拉起。"
  ssh "$HOST" "ps -C java -o pid=,args= | awk '/mall-admin-1\\.0-SNAPSHOT\\.jar/ {print \$1}' | xargs -r kill -9" || true
  sleep 2
  echo "  手工兜底命令：ssh $HOST \"cp $BK/mall-admin-1.0-SNAPSHOT.jar $JAR_REMOTE; cd $APP_DIR && ./start-backend.sh\""
  exit 1
fi
PHASE="started"

# ---------- 6~7. 管理端前端发布（仅 --with-web） ----------
if [ "$WEB" = 1 ]; then
  step "备份旧前端 admin-dist"
  ssh "$HOST" "mkdir -p '$BK' && tar czf '$BK/admin-dist.tgz' -C '$APP_DIR' admin-dist && ls -l '$BK/admin-dist.tgz'"

  step "同步 dist → $WEB_REMOTE 并校验首页"
  rsync -az --delete "$WEB_DIR/dist/" "$HOST:$WEB_REMOTE/"
  APP_JS=$(grep -o 'static/js/app\.[a-z0-9]*\.js' "$WEB_DIR/dist/index.html" | head -1)
  [ -n "$APP_JS" ] || { echo "本地 index.html 未找到 app.js 引用"; exit 1; }
  wcode=$(curl -s -o /tmp/admin-index.html -w '%{http_code}' --max-time 8 "$WEB_HEALTH_URL?deploy=$TS" || true)
  if [ "$wcode" != "200" ] || ! grep -q "$APP_JS" /tmp/admin-index.html; then
    echo
    echo "前端发布异常：$WEB_HEALTH_URL 返回 ${wcode}，首页未命中 $APP_JS"
    echo "回滚命令：ssh $HOST \"rm -rf $WEB_REMOTE && tar xzf $BK/admin-dist.tgz -C $APP_DIR\""
    exit 1
  fi
  echo "前端就绪：${WEB_HEALTH_URL}（${APP_JS}）"
fi

echo
echo "发布完成。备份：$BK"
echo "后端版本自检：登录后 GET /api/admin/info，响应应含 isGlobal / authorizedShopIds。"
[ "$WEB" = 1 ] && echo "前端入口：${WEB_HEALTH_URL}（强刷 Ctrl/Cmd+Shift+R 拿新资源）" || true
PHASE="done"