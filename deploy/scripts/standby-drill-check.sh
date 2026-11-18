#!/usr/bin/env bash
# 时叙 / CRM / 在场 双机「切换预演」只读核验（批次 3.5 / 4.5 前置）
#
# 用法：deploy/scripts/standby-drill-check.sh
# 说明：全部只读。不发版、不重启、不改 DNS、不启停任何业务进程。
#      需要本机能 ssh 到两台机器（root 免密）；DNS 查询用本机 dig。
#
# 判据（任一 FAIL 即 NO-GO）：见 docs/deploy/生产方案-最终版.md §9.9
set -u

PROD=121.40.119.57      # 时叙 + CRM 生产 + 在场温备
STBY=120.55.36.3        # 时叙备 + CRM 备 + 在场生产 + 轻疗生产
FAIL=0

say()  { printf '%s\n' "$*"; }
row()  { printf '  %-46s %s\n' "$1" "$2"; }
chk()  { # chk <desc> <got> <expect>
  if [ "$2" = "$3" ]; then row "PASS  $1" "$2"
  else row "FAIL  $1" "got=$2 want=$3"; FAIL=$((FAIL+1)); fi
}
chkne() { # chkne <desc> <a> <b>  —— 要求两者不同
  if [ "$2" != "$3" ]; then row "PASS  $1" "prod=$2 stby=$3"
  else row "FAIL  $1" "both=$2"; FAIL=$((FAIL+1)); fi
}
# 带重试：并发多条 ssh 时偶发失败会把已通过的项误判成 FAIL
sshx() {
  local h=$1 cmd=$2 out
  for _ in 1 2 3; do
    out=$(ssh -o BatchMode=yes -o ConnectTimeout=8 -o ServerAliveInterval=5 root@"$h" "$cmd" 2>/dev/null) && { printf '%s' "$out"; return 0; }
    sleep 1
  done
  printf '%s' "$out"
  return 1
}
# 从 env 文件里取键值（去掉引号）
envkey() { sshx "$1" "grep -E '^$2=' $3 | tail -1 | cut -d= -f2- | tr -d '\"'" ; }
unit_state() { sshx "$1" "systemctl is-active $2" ; }

say "=============================================================="
say " 双机切换预演核验  $(date '+%F %T')"
say " 生产 $PROD / 备机 $STBY"
say "=============================================================="

say ""
say "[1] 进程与端口"
for u in teahour-api fullyu-crm nginx; do
  chk "prod $u active" "$(unit_state "$PROD" "$u")" active
  chk "stby $u active" "$(unit_state "$STBY" "$u")" active
done
chk "prod presence(pm2) online" "$(sshx "$PROD" "pm2 jlist 2>/dev/null | grep -c '\"status\":\"online\"'")" 1

say ""
say "[2] 配置面（生产 vs 备机）"
for k in NODE_ENV INTEGRATIONS_MODE; do
  p=$(envkey "$PROD" "$k" /etc/teahour/api.env); s=$(envkey "$STBY" "$k" /etc/teahour/api.env)
  chk "teahour $k 主备一致" "$s" "$p"
done
p=$(envkey "$PROD" TASKS_ENABLED /etc/teahour/api.env); s=$(envkey "$STBY" TASKS_ENABLED /etc/teahour/api.env)
row "INFO  teahour TASKS_ENABLED" "prod=${p:-未设置(=true)} stby=${s:-未设置}"
chk "备机定时任务必须关" "${s:-unset}" false
# 同库判据：去掉密码后比较 host/db
p=$(envkey "$PROD" DATABASE_URL /etc/teahour/api.env | sed -E 's#://[^@]+@#@#')
s=$(envkey "$STBY" DATABASE_URL /etc/teahour/api.env | sed -E 's#://[^@]+@#@#')
chk "teahour 主备同库" "$s" "$p"
p=$(envkey "$PROD" DATABASE_URL /etc/fullyu-crm/crm.env | sed -E 's#://[^@]+@#@#')
s=$(envkey "$STBY" DATABASE_URL /etc/fullyu-crm/crm.env | sed -E 's#://[^@]+@#@#')
chk "crm 主备同库" "$s" "$p"

# 在场方向与上面相反：生产在 120.55，温备在 121.40
PRES_PROD=$STBY; PRES_STBY=$PROD
penv() { envkey "$1" "$2" /root/fullyu/apps/server/.env.local; }
chk "presence NODE_ENV 主备一致" "$(penv "$PRES_STBY" NODE_ENV)" "$(penv "$PRES_PROD" NODE_ENV)"
chk "presence REDIS_HOST 一致"    "$(penv "$PRES_STBY" REDIS_HOST)" "$(penv "$PRES_PROD" REDIS_HOST)"
chk "presence REDIS_DB 一致"      "$(penv "$PRES_STBY" REDIS_DB)"   "$(penv "$PRES_PROD" REDIS_DB)"
chk "presence 生产定时任务开"      "$(penv "$PRES_PROD" TASKS_ENABLED)" true
chk "presence 温备定时任务关"      "$(penv "$PRES_STBY" TASKS_ENABLED)" false

say ""
say "[3] 构建指纹（主备必须同源产物）"
for f in /opt/teahour/app/apps/server/dist/main.js /opt/teahour/app/apps/admin/dist/index.html /opt/fullyu-crm/apps/server/dist/main.js; do
  chk "md5 $(basename "$f") @$(dirname "$f")" \
      "$(sshx "$STBY" "md5sum $f 2>/dev/null | cut -d' ' -f1")" \
      "$(sshx "$PROD" "md5sum $f 2>/dev/null | cut -d' ' -f1")"
done
# 在场：生产 120.55 由 CI 发，温备 121.40 靠 deploy-presence-standby.sh，容易落后
for f in /root/fullyu/apps/server/dist/main.js /opt/fullyu/apps/admin/dist/index.html; do
  chk "presence md5 $(basename "$f") @$(dirname "$f")" \
      "$(sshx "$PRES_STBY" "md5sum $f 2>/dev/null | cut -d' ' -f1")" \
      "$(sshx "$PRES_PROD" "md5sum $f 2>/dev/null | cut -d' ' -f1")"
done

say ""
say "[4] 上传目录（4.3 分钟级同步）"
p=$(sshx "$PROD" "find /var/lib/teahour/uploads -type f | wc -l"); s=$(sshx "$STBY" "find /var/lib/teahour/uploads -type f | wc -l")
chk "文件数一致" "$s" "$p"
row "INFO  最新文件 mtime" "$(sshx "$STBY" "find /var/lib/teahour/uploads -type f -printf '%T+\n' 2>/dev/null | sort | tail -1")"
# 只能有一套同步：121.40 分钟级 push（带 flock + --update）；120.55 的旧 pull 已于 11-18 停用
chk "prod 有分钟级 push" "$(sshx "$PROD" "crontab -l 2>/dev/null | grep -c uploads-sync")" 1
chk "stby 无重复 pull" "$(sshx "$STBY" "ls /etc/cron.d/teahour-uploads-sync 2>/dev/null | wc -l")" 0

say ""
say "[5] nginx 语法与 vhost 同源"
chk "prod nginx -t" "$(sshx "$PROD" "nginx -t 2>&1 | grep -c successful")" 1
chk "stby nginx -t" "$(sshx "$STBY" "nginx -t 2>&1 | grep -c successful")" 1
chk "teahour vhost 内容一致" \
    "$(sshx "$STBY" "md5sum /etc/nginx/sites-enabled/teahour-standby.conf 2>/dev/null | cut -d' ' -f1")" \
    "$(sshx "$PROD" "md5sum /etc/nginx/sites-enabled/teahour-teahour.fullyu.cn.conf 2>/dev/null | cut -d' ' -f1")"
chk "crm vhost 内容一致" \
    "$(sshx "$STBY" "md5sum /etc/nginx/sites-enabled/crm-standby.conf 2>/dev/null | cut -d' ' -f1")" \
    "$(sshx "$PROD" "md5sum /etc/nginx/sites-enabled/crm.fullyu.cn.conf 2>/dev/null | cut -d' ' -f1")"

say ""
say "[6] 证书"
for h in "$PROD" "$STBY"; do
  end=$(sshx "$h" "openssl x509 -in /etc/nginx/cert/fullyu.cn.pem -noout -enddate 2>/dev/null | cut -d= -f2")
  # 用 openssl 自带的 -checkend（30 天），避免 macOS 没有 GNU date -d
  if sshx "$h" "openssl x509 -in /etc/nginx/cert/fullyu.cn.pem -noout -checkend 2592000 >/dev/null 2>&1" >/dev/null; then
    row "PASS  $h 证书剩余 >30 天" "$end"
  else
    row "FAIL  $h 证书 30 天内到期" "$end"; FAIL=$((FAIL+1))
  fi
  chk "$h 续期任务存在" "$(sshx "$h" "crontab -l 2>/dev/null | grep -ciE 'acme|cert-pull'")" 1
done

say ""
say "[7] 数据库连通（只读 SELECT 1，用各机自己的 env）"
for h in "$PROD" "$STBY"; do
  for svc in teahour crm; do
    f=/etc/teahour/api.env; [ "$svc" = crm ] && f=/etc/fullyu-crm/crm.env
    out=$(sshx "$h" "u=\$(grep -E '^DATABASE_URL=' $f | tail -1 | cut -d= -f2- | tr -d '\"'); \
      U=\$(printf '%s' \"\$u\" | sed -E 's#^mysql://([^:]+):.*#\1#'); \
      P=\$(printf '%s' \"\$u\" | sed -E 's#^mysql://[^:]+:([^@]+)@.*#\1#'); \
      H=\$(printf '%s' \"\$u\" | sed -E 's#^mysql://[^@]+@([^:/]+).*#\1#'); \
      D=\$(printf '%s' \"\$u\" | sed -E 's#.*/([^?]+).*#\1#'); \
      mysql -h\"\$H\" -u\"\$U\" -p\"\$P\" -D\"\$D\" -N -e 'select 1' 2>/dev/null")
    chk "$h $svc DB" "$out" 1
  done
done

say ""
say "[7b] 在场 Redis（47.111 db0，只读 PING）"
for h in "$PRES_PROD" "$PRES_STBY"; do
  out=$(sshx "$h" 'f=/root/fullyu/apps/server/.env.local; H=$(grep -E "^REDIS_HOST=" $f | cut -d= -f2- | tr -d "\""); P=$(grep -E "^REDIS_PASSWORD=" $f | cut -d= -f2- | tr -d "\""); D=$(grep -E "^REDIS_DB=" $f | cut -d= -f2- | tr -d "\""); redis-cli -h "$H" -a "$P" -n "${D:-0}" --no-auth-warning ping 2>/dev/null')
  chk "$h presence Redis PING" "$out" PONG
done

say ""
say "[8] 站点实测（备机走 --resolve，不依赖 DNS）"
for d in teahour.fullyu.cn crm.fullyu.cn presence.fullyu.cn; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 --resolve "$d:443:$STBY" "https://$d/")
  if [ "$code" = 200 ] || [ "$code" = 302 ]; then row "PASS  备机 https://$d/" "$code"
  else row "FAIL  备机 https://$d/" "$code"; FAIL=$((FAIL+1)); fi
done

say ""
say "[9] DNS TTL（决定切机生效时间）"
for d in teahour.fullyu.cn crm.fullyu.cn presence.fullyu.cn; do
  row "INFO  $d" "$(dig +noall +answer "$d" A | awk '{print $2"s -> "$5}' | head -1)"
done

say ""
say "--------------------------------------------------------------"
if [ "$FAIL" -eq 0 ]; then
  say "结论：GO（$FAIL 项 FAIL）—— 剩余动作需人工：改 DNS 记录 + 对调 TASKS_ENABLED，观察 10 分钟，按 §9.7 回滚"
else
  say "结论：NO-GO（$FAIL 项 FAIL）—— 先修 FAIL 项再演练"
fi
say "--------------------------------------------------------------"
exit "$FAIL"