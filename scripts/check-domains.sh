#!/usr/bin/env bash
# 域名一致性检查：凡是 *.fullyu.cn 主机名，必须在 docs/deploy/domains.tsv 里登记过。
#
# 用途：挡住"凭规律推断出来的域名"（例如把 test-zaichang 去掉前缀当成 zaichang）。
# 用法：
#   scripts/check-domains.sh                 # 只查仓库
#   scripts/check-domains.sh --remote        # 额外查线上 nginx server_name（需要 ssh 权限）
#
# 退出码：0 = 全部已登记；1 = 存在未登记域名。
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TSV="$ROOT/docs/deploy/domains.tsv"

[ -f "$TSV" ] || { echo "找不到域名清单：$TSV" >&2; exit 1; }

# ---- 1. 允许的域名集合（正式名 + 别名，排除已下线）----
allowed="$(
  awk -F'\t' '!/^#/ && NF>1 && $7 != "已下线" {print $2; print $3}' "$TSV" \
  | tr ',' '\n' | tr '、' '\n' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' \
  | grep -E '(^|\.)fullyu\.cn$' | sort -u
)"

# 已下线域名：允许在 docs/ 里记录历史，禁止再出现在代码与配置中
retired="$(
  awk -F'\t' '!/^#/ && NF>1 && $7 == "已下线" {print $2}' "$TSV" \
  | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' | grep -E '(^|\.)fullyu\.cn$' | sort -u
)"

is_retired() {
  local h="$1"
  printf '%s\n' "$retired" | grep -qxF "$h"
}

# 基础设施域名（邮件、验证），不参与业务校验
INFRA=" mail.fullyu.cn smtp.fullyu.cn imap.fullyu.cn pop3.fullyu.cn data.fullyu.cn "

is_allowed() {
  local h="$1"
  case "$INFRA" in *" $h "*) return 0 ;; esac
  printf '%s\n' "$allowed" | grep -qxF "$h"
}

# ---- 2. 收集仓库里出现的主机名 ----
# 排除：依赖、构建产物、本清单与脚本自身
hits="$(
  grep -rIohE '([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*fullyu\.cn' "$ROOT" \
    --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
    --exclude-dir=build --exclude-dir=unpackage --exclude-dir=coverage \
    --exclude='domains.tsv' --exclude='check-domains.sh' \
    2>/dev/null | sort -u
)"

bad=0
unknown=""
while IFS= read -r h; do
  [ -z "$h" ] && continue
  is_allowed "$h" && continue
  is_retired "$h" && continue
  unknown="${unknown}${h}"$'\n'
done <<< "$hits"

if [ -n "$unknown" ]; then
  bad=1
  echo "✗ 仓库里出现未登记的 fullyu.cn 域名："
  printf '%s' "$unknown" | while IFS= read -r h; do
    [ -z "$h" ] && continue
    echo "  $h"
    grep -rIn --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
      --exclude='domains.tsv' --exclude='check-domains.sh' \
      -F "$h" "$ROOT" 2>/dev/null | head -4 | sed 's/^/      /'
  done
fi

# ---- 2b. 已下线域名不得出现在 docs/ 之外 ----
# 用边界判断，避免把 "test-" 前缀的旧名当成命中
if [ -n "$retired" ]; then
  while IFS= read -r h; do
    [ -z "$h" ] && continue
    esc="$(printf '%s' "$h" | sed 's/[].[^$*+?(){}|\\]/\\&/g')"
    leaks="$(grep -rIlE --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
      --exclude-dir=build --exclude-dir=unpackage --exclude='check-domains.sh' \
      "(^|[^A-Za-z0-9.-])${esc}([^A-Za-z0-9-]|$)" "$ROOT" 2>/dev/null | grep -v "^$ROOT/docs/")"
    if [ -n "$leaks" ]; then
      bad=1
      echo "✗ 已下线域名 $h 仍出现在 docs/ 之外："
      printf '%s\n' "$leaks" | sed 's/^/      /'
    fi
  done <<< "$retired"
fi

# ---- 3. 可选：核对线上 nginx ----
if [ "${1:-}" = "--remote" ]; then
  for host in 120.55.36.3 121.40.119.57 8.133.6.18; do
    names="$(ssh -o ConnectTimeout=8 -o BatchMode=yes "root@$host" \
      "nginx -T 2>/dev/null | grep -oE 'server_name[^;]*' | sed 's/server_name//'" 2>/dev/null \
      | tr ' ' '\n' | grep -E '\.fullyu\.cn$' | sort -u)"
    if [ -z "$names" ]; then
      echo "… $host 取不到 nginx 配置，跳过"
      continue
    fi
    for h in $names; do
      is_allowed "$h" || { bad=1; echo "✗ $host nginx 里有未登记域名：$h"; }
    done
  done
fi

if [ "$bad" -eq 0 ]; then
  n=$(printf '%s\n' "$hits" | grep -c '\.fullyu\.cn$')
  echo "✓ ${n} 个 fullyu.cn 域名全部已在 domains.tsv 登记"
fi
exit "$bad"