#!/bin/bash
# 2026-11-17 P16：9929 只允许回环与内网，不再对公网直连
# 2026-11-18 P21：8080（同一份 admin 静态 + 反代 :3000 的明文入口）同样只留回环
# 只做入方向收口，不影响 nginx→127.0.0.1 的调用
set -u
IPT=/usr/sbin/iptables
ensure() { $IPT -C INPUT "$@" 2>/dev/null || $IPT -I INPUT "$@" ; }
for port in 9929 8080; do
  ensure 1 -i lo -p tcp --dport "$port" -j ACCEPT
  ensure 2 -s 172.16.0.0/12 -p tcp --dport "$port" -j ACCEPT
  $IPT -C INPUT -p tcp --dport "$port" -j DROP 2>/dev/null || $IPT -A INPUT -p tcp --dport "$port" -j DROP
done
exit 0
