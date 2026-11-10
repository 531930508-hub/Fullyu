#!/usr/bin/env bash
# 将时叙小程序切到真实微信登录（jscode2session + getuserphonenumber）。
# 只改登录能力：支付、打印、会员、平台仍保持 mock，不会产生真实扣款。
#
# 用法（root，服务器上执行）：
#   bash enable-wechat-live.sh /root/teahour-deploy/.wechat-appsecret   # 从 600 权限文件读取
#   bash enable-wechat-live.sh                                          # 交互输入，不回显
#
# 安全约定：AppSecret 只写入 /etc/teahour/api.env（640 root:teahour），
# 不打印、不写日志、不进命令行参数、不进 shell 历史。验证失败会自动回滚到 mock。
set -Eeuo pipefail
umask 077

ENV_FILE=/etc/teahour/api.env
SERVICE=teahour-api
APP_DIR=/opt/teahour/app
RUNTIME_DIR=/opt/teahour/runtime
BASE_URL=http://127.0.0.1:18787

log() { printf '\n==> %s\n' "$*"; }
die() { printf '\n[错误] %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "请用 root 运行"
[[ -f "$ENV_FILE" ]] || die "找不到 $ENV_FILE，请先完成时叙部署"
[[ -x "$RUNTIME_DIR/bin/node" ]] || die "找不到独立 Node 运行时：$RUNTIME_DIR/bin/node"

SECRET_FILE="${1:-}"
if [[ -n "$SECRET_FILE" ]]; then
  [[ -f "$SECRET_FILE" ]] || die "找不到 AppSecret 文件：$SECRET_FILE"
  SECRET="$(tr -d '\r\n' < "$SECRET_FILE")"
else
  [[ -t 0 ]] || die "非交互环境：请把 AppSecret 写入 600 权限文件并作为参数传入"
  printf '请输入小程序 AppSecret（输入不回显）：'
  IFS= read -rs SECRET
  printf '\n'
fi

[[ "$SECRET" =~ ^[A-Za-z0-9]{16,64}$ ]] || die "AppSecret 格式不正确（应为 16–64 位字母数字，且不含空白）"

log "备份现有配置"
BACKUP="$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"
cp -p "$ENV_FILE" "$BACKUP"
chmod 600 "$BACKUP"

rollback() {
  printf '\n[回滚] 恢复切换前配置并重启服务\n' >&2
  install -o root -g teahour -m 640 "$BACKUP" "$ENV_FILE"
  systemctl restart "$SERVICE" || true
  for _ in $(seq 1 30); do
    if curl -sf "$BASE_URL/api/health" -o /dev/null; then
      printf '[回滚] 服务已恢复为切换前配置\n' >&2
      exit 1
    fi
    sleep 1
  done
  printf '[回滚] 服务未在 30 秒内恢复，请人工检查 systemctl status %s\n' "$SERVICE" >&2
  exit 1
}

trap 'unset SECRET' EXIT

log "写入微信登录配置（金额支付仍为 mock）"
TMP="$(mktemp)"
grep -v -E '^(WECHAT_APPSECRET|INTEGRATIONS_WECHAT_MODE)=' "$ENV_FILE" > "$TMP" || true
printf 'WECHAT_APPSECRET=%s\n' "$SECRET" >> "$TMP"
printf 'INTEGRATIONS_WECHAT_MODE=live\n' >> "$TMP"
install -o root -g teahour -m 640 "$TMP" "$ENV_FILE"
rm -f "$TMP"
unset SECRET

log "重启 $SERVICE"
systemctl restart "$SERVICE"

log "等待健康检查"
OK=0
for _ in $(seq 1 30); do
  if curl -sf "$BASE_URL/api/health" -o /tmp/teahour-health.json; then OK=1; break; fi
  sleep 1
done
[[ $OK -eq 1 ]] || rollback

HEALTH="$(cat /tmp/teahour-health.json)"
rm -f /tmp/teahour-health.json

printf '%s' "$HEALTH" | grep -q '"wechat":{"name":"weixin-miniprogram-live","mode":"live"}' || {
  printf '%s\n' "$HEALTH" >&2
  rollback
}
printf '%s' "$HEALTH" | grep -q '"payment":{"name":"mock-payment","mode":"mock"}' || {
  printf '支付渠道不再为 mock，请人工确认后再继续\n' >&2
  rollback
}

log "用无效 code 探测真实微信接口（凭证错误会在这里暴露）"
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
cd "$APP_DIR"
if ! "$RUNTIME_DIR/bin/node" -e '
const { WechatMiniProgramAuth } = require(process.cwd() + "/packages/integrations/dist");
const auth = new WechatMiniProgramAuth({
  appId: process.env.WECHAT_APPID,
  appSecret: process.env.WECHAT_APPSECRET,
  paymentMode: "mock"
});
auth.code2Session("teahour-probe-invalid-code")
  .then(() => { console.log("PROBE_FAIL: 无效 code 竟然登录成功"); process.exit(1); })
  .catch((error) => {
    const message = String((error && error.message) || "");
    if (/(40029|invalid code|invalid grant_type)/i.test(message)) {
      console.log("PROBE_OK: 微信已受理当前凭证，并按预期拒绝无效 code");
      process.exit(0);
    }
    console.log("PROBE_FAIL: " + message);
    process.exit(1);
  });
'; then
  rollback
fi

log "完成：微信登录 live，支付仍为 mock"
printf '健康检查：%s\n' "$(curl -s "$BASE_URL/api/health")"
printf '配置备份（不含新密钥）：%s\n' "$BACKUP"
