#!/usr/bin/env bash
# 时叙上传目录：主 121.40 -> 备 120.55，分钟级增量（只增不删，--update 防回退覆盖）
set -u
exec 9>/var/lock/fu-teahour-uploads.lock
flock -n 9 || exit 0
rsync -a --update --timeout=30 \
  -e "ssh -o BatchMode=yes -o ConnectTimeout=5" \
  /var/lib/teahour/uploads/ root@120.55.36.3:/var/lib/teahour/uploads/ \
  >> /var/log/fu-teahour-uploads.log 2>&1
