#!/bin/sh
set -e

# 工作目录固定为 server 应用根（Dockerfile 中已 WORKDIR /app/apps/server）
cd /app/apps/server

# 可选：容器启动时应用数据库迁移。
# 生产环境统一使用 prisma migrate deploy（幂等应用已生成的迁移），
# 绝不使用 dev migrate。通过环境变量 RUN_MIGRATIONS=true 开启。
if [ "${RUN_MIGRATIONS}" = "true" ]; then
  echo "[entrypoint] Applying database migrations (prisma migrate deploy)..."
  ./node_modules/.bin/prisma migrate deploy
fi

echo "[entrypoint] Starting Full愈 server on port ${PORT:-3000}..."
exec node dist/main
