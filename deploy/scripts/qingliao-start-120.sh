#!/usr/bin/env bash
# 120.55 起轻疗：用独立 JDK8，不改系统默认 java（25 给在场用）
# 2026-11-18 改造：支持 /etc/fullyu/qingliao.env 注入（BRAND_CRM_* 等），换 jar 不再丢变量
set -euo pipefail
cd /server/java/fully
# set -a 必须：否则 . 进来的变量只是 shell 变量、不会进 java 环境。
# 2026-11-19 踩过：OSS AK 变成空串，启动即 InvalidCredentialsException。
set -a; [ -f /etc/fullyu/qingliao.env ] && . /etc/fullyu/qingliao.env; set +a
JAVA=/usr/lib/jvm/java-8-openjdk-amd64/jre/bin/java
if pgrep -f "mall-admin-1.0-SNAPSHOT.jar" >/dev/null; then echo "already running: $(pgrep -f mall-admin-1.0-SNAPSHOT.jar)"; exit 1; fi
mkdir -p logs
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 TZ=Asia/Shanghai
nohup "$JAVA" -Xms1g -Xmx2560m -Dfile.encoding=UTF-8 -Dspring.profiles.active=prod \
  -jar mall-admin-1.0-SNAPSHOT.jar --spring.redis.password="${REDIS_PASSWORD:-c11e681c03334066ab24ba3a}" >> "logs/mall-admin-$(date +%F).log" 2>&1 &
echo "PID $!"
