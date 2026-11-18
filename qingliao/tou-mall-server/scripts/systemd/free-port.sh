#!/bin/bash
# mall-test 启动前释放 19929 端口。
#
# 背景：历史手工 `setsid nohup java -jar ...` 起的进程不在 systemd 的 cgroup 里，
# `systemctl restart` 杀不掉它，新实例绑定 19929 失败后退避重启，服务实际一直跑旧包
# ——2026-11-18 19:23-20:25 测试环境就是这样「部署了但代码没换」，大会员页报错。
# 由 mall-test.service 的 ExecStartPre 调用（见 mall-test.service.d/10-free-port.conf）。
#
# 只结束监听该端口的进程；端口空闲时直接退出 0，不影响正常启停。
set -u

PORT="${1:-19929}"
LSOF="/usr/bin/lsof"

pids() {
	$LSOF -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | tr '\n' ' ' | sed 's/ *$//'
}

holders=$(pids)
[ -z "$holders" ] && exit 0

echo "free-port: $PORT 被残留进程占用（$holders），先结束它" >&2
kill $holders 2>/dev/null || true

for _ in 1 2 3 4 5; do
	sleep 1
	left=$(pids)
	[ -z "$left" ] && { echo "free-port: 端口已释放" >&2; exit 0; }
done

echo "free-port: SIGTERM 无效，强杀 $left" >&2
kill -9 $left 2>/dev/null || true
exit 0
