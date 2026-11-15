#!/bin/bash
# 47.111 Redis(6379)/RabbitMQ(5672) 来源白名单
#   2026-11-16 立（批次 0.4 主机层）；阿里云安全组另做一层，两者互补。
#   幂等：每次重建 FU_MQ 链；IPv4 白名单三台，IPv6 仅放行回环（ECS 无公网 v6）。
set -u
ALLOW="8.133.6.18 120.55.36.3 121.40.119.57"

build() {
  local cmd=$1 p ip
  $cmd -N FU_MQ 2>/dev/null || true
  $cmd -F FU_MQ
  for p in 6379 5672; do
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
