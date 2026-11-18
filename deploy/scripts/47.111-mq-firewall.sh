#!/bin/bash
# 47.111 Redis(6379)/RabbitMQ(5672)/管理台(15672) 来源白名单
#   2026-11-16 立（批次 0.4 主机层）；阿里云安全组另做一层，两者互补。
#   2026-11-17 加 15672（此前管理台对公网 OPEN，管理口默认口令暴露）与 IPv4 回环放行；
#              加回环同时修掉"本机 redis-cli 被 DROP 卡死"的老毛病。
#   幂等：每次重建 FU_MQ 链；IPv4 白名单三台 + 回环，IPv6 仅回环（ECS 无公网 v6）。
set -u
ALLOW="127.0.0.1 8.133.6.18 120.55.36.3 121.40.119.57"
PORTS="6379 5672 15672"

build() {
  local cmd=$1 p ip
  $cmd -N FU_MQ 2>/dev/null || true
  $cmd -F FU_MQ
  for p in $PORTS; do
    if [ "$cmd" = ip6tables ]; then
      $cmd -A FU_MQ -p tcp --dport "$p" -s ::1 -j ACCEPT
    else
      for ip in $ALLOW; do
        $cmd -A FU_MQ -p tcp --dport "$p" -s "$ip" -j ACCEPT
      done
    fi
    $cmd -A FU_MQ -p tcp --dport "$p" -j DROP
  done
  $cmd -A FU_MQ -j RETURN
  # INPUT 里只挂一次
  $cmd -C INPUT -j FU_MQ 2>/dev/null || $cmd -I INPUT 1 -j FU_MQ
}

build iptables
command -v ip6tables >/dev/null && build ip6tables
exit 0
