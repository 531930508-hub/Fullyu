#!/bin/bash
# 121.40：从 120.55（acme.sh 续期机）拉取 *.fullyu.cn 证书。
# 背景：acme.sh 的 reloadcmd 只在 120.55 本机 reload + 推 8.133，
#       121.40 上没有任何续期动作，证书会静默过期（P10）。
# 行为：内容相同不动；变化才安装并 `nginx -t && systemctl reload`，失败自动回滚。
set -u
LOG=/var/log/fullyu-cert-pull.log
SRC_HOST=root@120.55.36.3
DIR=/etc/nginx/cert
TMP=$(mktemp -d) || exit 1
trap 'rm -rf "$TMP"' EXIT
log(){ echo "[$(date "+%F %T")] $*" >> "$LOG"; }

scp -q -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new \
  "$SRC_HOST:$DIR/fullyu.cn.pem" "$SRC_HOST:$DIR/fullyu.cn.key" "$TMP/" \
  || { log "FAILED scp from $SRC_HOST"; exit 1; }

# 只接受「签名有效且剩余 >=30 天」且覆盖 teahour.fullyu.cn 的证书
openssl x509 -in "$TMP/fullyu.cn.pem" -noout -checkend 2592000 >/dev/null 2>&1 \
  || { log "SKIP 拉到的证书 30 天内到期或无效"; exit 1; }
openssl x509 -in "$TMP/fullyu.cn.pem" -noout -checkhost teahour.fullyu.cn 2>/dev/null | grep -q "does match" \
  || { log "SKIP 证书不覆盖 teahour.fullyu.cn"; exit 1; }

new=$(sha256sum "$TMP/fullyu.cn.pem" | awk '{print $1}')
cur=$(sha256sum "$DIR/fullyu.cn.pem" 2>/dev/null | awk '{print $1}')
[ "$new" = "$cur" ] && exit 0

ts=$(date +%Y%m%d-%H%M%S)
cp -p "$DIR/fullyu.cn.pem" "$DIR/fullyu.cn.pem.bak-$ts"
cp -p "$DIR/fullyu.cn.key" "$DIR/fullyu.cn.key.bak-$ts"
install -m 0644 "$TMP/fullyu.cn.pem" "$DIR/fullyu.cn.pem"
install -m 0600 "$TMP/fullyu.cn.key"  "$DIR/fullyu.cn.key"

if nginx -t >/dev/null 2>&1 && systemctl reload nginx; then
  log "OK 证书已更新并 reload（备份 .bak-$ts）"
else
  cp -p "$DIR/fullyu.cn.pem.bak-$ts" "$DIR/fullyu.cn.pem"
  cp -p "$DIR/fullyu.cn.key.bak-$ts" "$DIR/fullyu.cn.key"
  log "FAILED nginx 校验/reload，已回滚到 .bak-$ts"
  exit 1
fi
