#!/usr/bin/env bash
# 校验必需环境变量是否齐全。只比对"键是否存在/值是否为空"，绝不打印值。
#
# 用法:
#   check-env-keys.sh <keys-file> <env-file>      # 发布前：校验服务器 env 文件
#   check-env-keys.sh <keys-file> --pid <PID>     # 启动后：校验进程 /proc/PID/environ
#
# 退出码: 0 齐全；1 有缺失/空值；2 用法或文件问题
#
# 为什么要单独查进程环境：start-120.sh 里 `set -a; . env; set +a` 少一个就会出现
# "文件里有、Java 里没有"（2026-11-18 OSS AK 空串即此因），只看文件会漏。
set -uo pipefail

keys_file=${1:-}
mode=${2:-}
arg=${3:-}
[ -f "$keys_file" ] || { echo "用法: $(basename "$0") <keys-file> <env-file|--pid PID>"; exit 2; }
[ -n "$mode" ] || { echo "用法: $(basename "$0") <keys-file> <env-file|--pid PID>"; exit 2; }

tmp=$(mktemp) || exit 2
trap 'rm -f "$tmp"' EXIT

if [ "$mode" = "--pid" ]; then
  [ -r "/proc/${arg:-/nonexistent}/environ" ] || { echo "读不到 /proc/$arg/environ（PID 不对或无权限？）"; exit 2; }
  tr '\0' '\n' < "/proc/$arg/environ" > "$tmp"
  src="进程 PID $arg 的 environ"
else
  [ -r "$mode" ] || { echo "读不到 env 文件: $mode"; exit 2; }
  grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$mode" > "$tmp" 2>/dev/null
  src="$mode"
fi

val_of() { # val_of KEY —— 从 $tmp 里取值（不打印）
  local l
  l=$(grep -m1 "^$1=" "$tmp" 2>/dev/null) || return 0
  printf '%s' "${l#*=}"
}

missing=""
empty=""
n=0
skipped=0
cond_key=""
cond_val=""
while IFS= read -r key || [ -n "$key" ]; do
  case "$key" in ''|\#*) continue ;; esac
  case "$key" in
  WHEN=*)
    # WHEN=KEY=VALUE 开启条件组，WHEN= 结束条件组
    spec=${key#WHEN=}
    if [ -z "$spec" ]; then cond_key=""; cond_val=""
    else cond_key=${spec%%=*}; cond_val=${spec#*=}; fi
    continue ;;
  esac
  key=${key%%[[:space:]]*}
  if [ -n "$cond_key" ] && [ "$(val_of "$cond_key")" != "$cond_val" ]; then
    skipped=$((skipped + 1)); continue
  fi
  n=$((n + 1))
  line=$(grep -m1 "^${key}=" "$tmp" 2>/dev/null) || true
  if [ -z "$line" ]; then
    missing="$missing $key"
  else
    value=${line#*=}
    [ -z "$value" ] && empty="$empty $key"
  fi
done < "$keys_file"

echo "env 来源: $src（应查 $n 个键，按条件跳过 $skipped 个）"
[ -n "$missing" ] && echo "  缺失:$missing"
[ -n "$empty" ] && echo "  空值:$empty"
if [ -z "$missing" ] && [ -z "$empty" ]; then
  echo "  ok: 必需键齐全"
  exit 0
fi
echo "  FAIL: 缺键会静默降级（支付/短信/上传只在调用时失败），先补齐再发版或重启"
exit 1
