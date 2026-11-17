#!/usr/bin/env bash
# 47.111（sg-bp14p6i0m9h1oql5j0zy）安全组收口：把 15672 / 3389 / 9930 的 0.0.0.0/0 规则撤掉。
#
# 为什么是这三条：
#   - 15672 RabbitMQ 管理台：主机层 iptables(FU_MQ) 已经 DROP 了非白名单，所以公网打不通；
#     但「安全组开口 + 主机层兜底」只有一层，云上失配（换网卡/重装/规则误删）就裸奔。
#   - 3389 RDP：三台机器都没有监听，纯僵尸规则。
#   - 9930：三台机器都没有监听（轻疗实际是 9929，且已被主机层 fu-port-guard 挡），纯僵尸规则。
# 该安全组同时挂在 120.55（轻疗生产）上，所以只撤不相关端口，6379/5672/22/80/443/9929 一律不碰。
#
# 用法：
#   ./aliyun-sg-tighten.sh            # 只看，列出待撤规则并打印等价命令
#   ./aliyun-sg-tighten.sh --apply    # 执行撤销，先存 JSON 备份，再复核
#   ./aliyun-sg-tighten.sh --rollback <备份json>   # 按备份逐条加回
#
# 需要 aliyun CLI 且当前 profile 有 ECS 写权限（oss 这个 profile 已确认可读，写权限执行时再验）。
set -uo pipefail

PROFILE=${PROFILE:-oss}
REGION=cn-hangzhou
SG=sg-bp14p6i0m9h1oql5j0zy
PORTS="15672 3389 9930"
BACKUP_DIR=${BACKUP_DIR:-/Users/th/Desktop/fullyu-platform/deploy/backup}
TS=$(date +%Y%m%d-%H%M%S)

al() { aliyun --profile "$PROFILE" --region "$REGION" "$@"; }

describe() { al ecs DescribeSecurityGroupAttribute --SecurityGroupId "$SG"; }

# 输出待撤规则：<port> <proto> <cidr> <policy>
list_targets() {
  describe | python3 -c '
import json,sys
ports=set(sys.argv[1].split())
d=json.load(sys.stdin)["Permissions"]["Permission"]
for p in d:
    if p.get("Direction")!="ingress": continue
    if p.get("SourceCidrIp") not in ("0.0.0.0/0",): continue
    pr = p.get("PortRange", "")
    # 阿里云返回的是 "15672/15672" 这种首尾格式，两种都认
    if pr.split("/")[0] in ports:
        print(pr, p.get("IpProtocol"), p.get("SourceCidrIp"), p.get("Policy"))
' "$PORTS"
}

apply_revoke() {
  local out="$BACKUP_DIR/${SG}-${TS}.json"
  mkdir -p "$BACKUP_DIR"
  describe > "$out"
  say "已备份安全组现状：$out"

  list_targets | while read -r port proto cidr policy; do
    [ -z "${port:-}" ] && continue
    [ "$policy" = "Drop" ] && { say "跳过 $port（已是 Drop）"; continue; }
    say "撤销 $port/$proto $cidr"
    al ecs RevokeSecurityGroup \
      --SecurityGroupId "$SG" \
      --IpProtocol "$proto" \
      --PortRange "$port" \
      --SourceCidrIp "$cidr" \
      --Policy accept >/dev/null || say "撤销 $port 失败（继续）"
  done

  say "复核：剩下的通配规则"
  list_targets || true
  say "复核：白名单规则仍在（办公 IP + 内网三台）"
  describe | python3 -c '
import json,sys
d=json.load(sys.stdin)["Permissions"]["Permission"]
keep=[p for p in d if p.get("Direction")=="ingress" and p.get("PortRange") in {"15672","3389","9930"}]
for p in keep: print(" ", p["PortRange"], p.get("SourceCidrIp"), p.get("Policy"))
' | sort | uniq -c
}

rollback_from() {
  local f=$1
  [ -f "$f" ] || { echo "备份文件不存在：$f"; exit 1; }
  python3 -c '
import json,sys
d=json.load(open(sys.argv[1]))["Permissions"]["Permission"]
ports={"15672","3389","9930"}
for p in d:
    if p.get("Direction")=="ingress" and p.get("PortRange","").split("/")[0] in ports and p.get("SourceCidrIp"):
        print(p["PortRange"], p.get("IpProtocol"), p["SourceCidrIp"], p.get("Policy","accept"))
' "$f" | while read -r port proto cidr policy; do
    say "加回 $port/$proto $cidr ($policy)"
    al ecs AuthorizeSecurityGroup --SecurityGroupId "$SG" --IpProtocol "$proto" \
      --PortRange "$port" --SourceCidrIp "$cidr" --Policy "$policy" >/dev/null || say "加回 $port 失败（可能已存在）"
  done
}

say() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

case "${1:-}" in
  "")
    say "待撤规则（$SG，端口 $PORTS，来源 0.0.0.0/0）："
    targets=$(list_targets)
    if [ -z "$targets" ]; then say "没有需要撤的规则"; else echo "$targets"; fi
    say "只读模式，未做任何修改；确认后加 --apply"
    ;;
  --apply) apply_revoke ;;
  --rollback) shift; rollback_from "${1:?需要备份 json 路径}" ;;
  *) echo "用法：$0 [--apply | --rollback <备份json>]"; exit 2 ;;
esac