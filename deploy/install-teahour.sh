#!/usr/bin/env bash
# 时叙独立部署脚本（staging / mock 对接，不触碰同机已有站点）
# 用法：sudo bash install-teahour.sh <域名> [Let's Encrypt 邮箱]
#
# 约定：
# - 代码与运行时在 /opt/teahour，业务数据在 /var/lib/teahour，不写进代码目录；
# - 后端只监听 127.0.0.1:18787，由 Nginx 反代；
# - 只新增自己的 Nginx vhost 与 systemd 单元，不修改、不重启其它服务；
# - NODE_ENV=staging + INTEGRATIONS_MODE=mock：不接真实支付/打印/会员/平台。
set -Eeuo pipefail
umask 027

DOMAIN="${1:-}"
EMAIL="${2:-}"
SERVICE_USER=teahour
APP_DIR=/opt/teahour/app
RUNTIME_DIR=/opt/teahour/runtime
DATA_DIR=/var/lib/teahour
ETC_DIR=/etc/teahour
LOG_DIR=/var/log/teahour
PORT=18787
NODE_VERSION="${NODE_VERSION:-20.19.5}"
PNPM_VERSION="${PNPM_VERSION:-10.34.4}"

log() { printf '\n==> %s\n' "$*"; }
die() { printf '\n[错误] %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "请用 root 运行（sudo bash $0 $DOMAIN）"
[[ -n "$DOMAIN" ]] || die "缺少域名。用法：sudo bash $0 <域名> [邮箱]"
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || die "域名格式不正确：$DOMAIN"
command -v nginx >/dev/null 2>&1 || die "未检测到 nginx。为避免破坏同机站点，本脚本不自动安装；请先确认现有 Web 服务。"
command -v curl >/dev/null 2>&1 || die "缺少 curl"
command -v tar >/dev/null 2>&1 || die "缺少 tar"

log "创建独立运行账号与目录"
id -u "$SERVICE_USER" >/dev/null 2>&1 || \
  useradd --system --home-dir "$DATA_DIR" --shell /sbin/nologin "$SERVICE_USER"
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 750 "$DATA_DIR" "$DATA_DIR/uploads" "$LOG_DIR"
install -d -m 755 "$APP_DIR" "$RUNTIME_DIR"
install -d -m 750 "$ETC_DIR"

log "准备 Node ${NODE_VERSION}（独立安装，不覆盖系统 Node）"
if [[ ! -x "$RUNTIME_DIR/bin/node" ]]; then
  case "$(uname -m)" in
    x86_64|amd64) NODE_ARCH=x64 ;;
    aarch64|arm64) NODE_ARCH=arm64 ;;
    *) die "不支持的 CPU 架构：$(uname -m)" ;;
  esac
  NODE_FILE="node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
  NODE_OK=0
  for BASE in "https://npmmirror.com/mirrors/node/v${NODE_VERSION}" "https://nodejs.org/dist/v${NODE_VERSION}"; do
    if curl -fsSL --retry 3 --connect-timeout 10 "$BASE/$NODE_FILE" -o "/tmp/$NODE_FILE"; then NODE_OK=1; break; fi
  done
  [[ $NODE_OK -eq 1 ]] || die "Node 下载失败，请检查网络或手动放置 Node 到 $RUNTIME_DIR"
  tar -xJf "/tmp/$NODE_FILE" -C "$RUNTIME_DIR" --strip-components=1
  rm -f "/tmp/$NODE_FILE"
fi
export PATH="$RUNTIME_DIR/bin:$PATH"
node -v

log "准备 pnpm ${PNPM_VERSION}"
if [[ ! -x "$RUNTIME_DIR/bin/pnpm" ]]; then
  npm config set prefix "$RUNTIME_DIR"
  npm install -g "pnpm@${PNPM_VERSION}" --registry=https://registry.npmmirror.com
fi
pnpm -v

[[ -f "$APP_DIR/package.json" ]] || die "代码未就绪：$APP_DIR/package.json 不存在。请先解压源码到 $APP_DIR"

log "安装依赖（含构建依赖；不写入业务数据）"
cd "$APP_DIR"
pnpm install --frozen-lockfile --registry=https://registry.npmmirror.com

log "生成 Prisma Client（workspace 根安装时 postinstall 找不到 schema，需显式生成）"
pnpm --filter @teahour/server db:generate

log "构建工作区包 / 后端 / 后台 / 小程序 H5"
pnpm --filter @teahour/shared build
pnpm --filter @teahour/integrations build
pnpm --filter @teahour/server build
pnpm --filter @teahour/admin build
VITE_BASE=/mp/ VITE_API_BASE=/api pnpm --filter @teahour/miniprogram build:h5

# 代码只读交给服务账号所在组；不要用 root:root 750，否则服务账号读不到 dist。
chown -R root:"$SERVICE_USER" "$APP_DIR"
chmod -R g+rX,o+rX "$APP_DIR"

log "写入运行配置（已存在则不覆盖，避免轮换密钥）"
if [[ ! -f "$ETC_DIR/api.env" ]]; then
  JWT="$(openssl rand -base64 48 | tr -d '\n')"
  cat > "$ETC_DIR/api.env" <<EOF
NODE_ENV=staging
PORT=${PORT}
DATABASE_URL=file:${DATA_DIR}/teahour.db
UPLOAD_ROOT=${DATA_DIR}/uploads
ASSET_BASE_URL=https://${DOMAIN}
JWT_SECRET=${JWT}
INTEGRATIONS_MODE=mock
INTEGRATIONS_ENV=staging
WECHAT_APPID=wxd9e4e4568d1bc8bb
EOF
  chown root:"$SERVICE_USER" "$ETC_DIR/api.env"
  chmod 640 "$ETC_DIR/api.env"
fi
set -a
# shellcheck disable=SC1090
. "$ETC_DIR/api.env"
set +a

log "数据库迁移"
DB_EXISTED=0
[[ -s "$DATA_DIR/teahour.db" ]] && DB_EXISTED=1
pnpm --filter @teahour/server db:deploy

if [[ $DB_EXISTED -eq 0 ]]; then
  log "首次初始化种子数据（随机初始密码只写入 root 600 文件）"
  ADMIN_PW="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)"
  printf '时叙初始账号：13800000001 – 13800000006\n密码：%s\n' "$ADMIN_PW" > "$ETC_DIR/initial-admin.txt"
  chmod 600 "$ETC_DIR/initial-admin.txt"
  NODE_ENV=staging SEED_FORCE=1 SEED_PASSWORD="$ADMIN_PW" pnpm --filter @teahour/server db:seed
  unset ADMIN_PW
else
  log "数据库已存在，跳过种子（不覆盖现有数据）"
fi

# 迁移/种子由 root 执行，生成的文件默认 root 所有；服务需要读写数据库与上传目录。
chown -R "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR"
chmod 750 "$DATA_DIR" "$DATA_DIR/uploads"
find "$DATA_DIR" -type f -exec chmod 640 {} +

log "安装 systemd 单元"
cat > /etc/systemd/system/teahour-api.service <<EOF
[Unit]
Description=Teahour API (staging, isolated)
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${APP_DIR}/apps/server
EnvironmentFile=${ETC_DIR}/api.env
ExecStart=${RUNTIME_DIR}/bin/node dist/main.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=${DATA_DIR}
UMask=0077

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable teahour-api.service
systemctl restart teahour-api.service

log "查找可用证书（只读复用，不新建、不覆盖）"
TLS_CERT=""
TLS_KEY=""
for CERT in /etc/nginx/cert/*.pem /etc/letsencrypt/live/*/fullchain.pem; do
  [[ -f "$CERT" ]] || continue
  KEY="${CERT%.pem}.key"
  [[ "$CERT" == */letsencrypt/* ]] && KEY="$(dirname "$CERT")/privkey.pem"
  [[ -f "$KEY" ]] || continue
  if openssl x509 -in "$CERT" -noout -checkhost "$DOMAIN" 2>/dev/null | grep -q 'does match'; then
    TLS_CERT="$CERT"; TLS_KEY="$KEY"; break
  fi
done
if [[ -n "$TLS_CERT" ]]; then log "复用证书：$TLS_CERT"; else log "未找到覆盖 ${DOMAIN} 的证书，先只开 HTTP"; fi

log "写入 Nginx 站点（只新增 teahour 自己的 vhost）"
SAFE_DOMAIN="$(printf '%s' "$DOMAIN" | tr -c 'A-Za-z0-9.-' '_')"
if [[ -d /etc/nginx/sites-available && -d /etc/nginx/sites-enabled ]]; then
  SITE_CONF="/etc/nginx/sites-available/teahour-${SAFE_DOMAIN}.conf"
else
  SITE_CONF="/etc/nginx/conf.d/teahour-${SAFE_DOMAIN}.conf"
fi
if [[ -n "$TLS_CERT" ]]; then
  cat > "$SITE_CONF" <<EOF
# 时叙（自动生成，独立于同机其它站点）
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    ssl_certificate ${TLS_CERT};
    ssl_certificate_key ${TLS_KEY};
    ssl_protocols TLSv1.2 TLSv1.3;
    server_name ${DOMAIN};
    client_max_body_size 8m;

    root ${APP_DIR}/apps/admin/dist;
    index index.html;

    location ^~ /api/ {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    location ^~ /uploads/ {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location ^~ /mp/ {
        alias ${APP_DIR}/apps/miniprogram/dist/build/h5/;
        index index.html;
        try_files \$uri \$uri/ /mp/index.html;
    }

    location ^~ /static/ {
        alias ${APP_DIR}/apps/miniprogram/dist/build/h5/static/;
        expires 7d;
        access_log off;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache";
    }
}
EOF
else
  cat > "$SITE_CONF" <<EOF
# 时叙（自动生成，独立于同机其它站点；暂无证书，仅 HTTP）
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};
    client_max_body_size 8m;

    root ${APP_DIR}/apps/admin/dist;
    index index.html;

    location ^~ /api/ {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    location ^~ /uploads/ {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location ^~ /mp/ {
        alias ${APP_DIR}/apps/miniprogram/dist/build/h5/;
        index index.html;
        try_files \$uri \$uri/ /mp/index.html;
    }

    location ^~ /static/ {
        alias ${APP_DIR}/apps/miniprogram/dist/build/h5/static/;
        expires 7d;
        access_log off;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache";
    }
}
EOF
fi
if [[ "$SITE_CONF" == /etc/nginx/sites-available/* ]]; then
  ln -sfn "$SITE_CONF" "/etc/nginx/sites-enabled/$(basename "$SITE_CONF")"
fi
nginx -t
systemctl reload nginx

log "健康检查"
for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null || die "后端健康检查失败，请查看 journalctl -u teahour-api -n 100"
if [[ -n "$TLS_CERT" ]]; then
  ADMIN_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/")"
  MP_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/mp/")"
else
  ADMIN_CODE="$(curl -sS -o /dev/null -w '%{http_code}' -H "Host: ${DOMAIN}" "http://127.0.0.1/")"
  MP_CODE="$(curl -sS -o /dev/null -w '%{http_code}' -H "Host: ${DOMAIN}" "http://127.0.0.1/mp/")"
fi
[[ "$ADMIN_CODE" == 200 ]] || die "后台首页返回 ${ADMIN_CODE}"
[[ "$MP_CODE" == 200 ]] || die "小程序 H5 返回 ${MP_CODE}"

log "HTTPS（微信原生扫一扫必须使用已备案的 https 链接）"
if [[ -n "$TLS_CERT" ]]; then
  echo "已复用现有证书 ${TLS_CERT}（到期前需续期，续期后 reload nginx 即可）"
elif [[ -n "$EMAIL" ]] && command -v certbot >/dev/null 2>&1; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect
elif command -v certbot >/dev/null 2>&1; then
  echo "已安装 certbot，但未提供邮箱。可执行：certbot --nginx -d ${DOMAIN} --redirect"
else
  echo "未安装 certbot。请为 ${DOMAIN} 配置证书后再启用 HTTPS；微信原生扫码要求 https。"
fi

cat <<EOF

部署完成（staging / mock）：
- 管理后台：https://${DOMAIN}/   （未配证书前为 http）
- 小程序 H5：https://${DOMAIN}/mp/
- API：https://${DOMAIN}/api/health
- 初始账号：13800000001 – 13800000006，密码见 ${ETC_DIR}/initial-admin.txt（root 600）
- 服务：systemctl status teahour-api
- 日志：journalctl -u teahour-api -f
- 数据：${DATA_DIR}/teahour.db、${DATA_DIR}/uploads

未接入：真实支付、打印、会员、外卖平台、在场接口（INTEGRATIONS_MODE=mock）。
未改动同机已有站点；如现有 Nginx 已有 443 配置，请把证书补到 ${SITE_CONF}。
EOF
