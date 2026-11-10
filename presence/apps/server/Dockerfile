# syntax=docker/dockerfile:1.7
# Full愈 后端镜像（pnpm monorepo 多阶段构建）
# 构建上下文必须为仓库根目录：
#   docker build -f apps/server/Dockerfile -t fullyu-server .
# 或使用根目录 docker-compose.yml（context: .）。

############################
# 基础镜像：node + pnpm
############################
FROM node:20-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="/pnpm:$PATH"
# 与本地 lockfileVersion 9.0 对齐的 pnpm 版本
RUN corepack enable && corepack prepare pnpm@10.34.4 --activate
WORKDIR /app

############################
# 构建阶段：安装全部依赖并编译
############################
FROM base AS builder
# bcrypt 原生编译 + prisma 引擎需要 openssl
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 1) 先仅拷贝各 workspace 的清单，最大化利用依赖层缓存
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/miniprogram/package.json apps/miniprogram/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/design-tokens/package.json packages/design-tokens/package.json

# 2) 仅安装 server 的依赖闭包（含其 workspace 依赖 @fullyu/shared 与 devDeps 供编译）
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @fullyu/server...

# 3) 拷贝构建所需源码
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server

# 4) 编译 shared(CJS) → 生成 Prisma Client → 编译 server
RUN pnpm --filter @fullyu/shared build \
 && pnpm --filter @fullyu/server db:generate \
 && pnpm --filter @fullyu/server build

############################
# 运行阶段：精简运行镜像
############################
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 保留 pnpm workspace 布局，确保运行时 @fullyu/shared(require→dist) 与
# Prisma Client(node_modules/.prisma) 均可被正确解析
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/tsconfig.base.json /app/
COPY --from=builder /app/packages/shared /app/packages/shared
COPY --from=builder /app/apps/server /app/apps/server

WORKDIR /app/apps/server
RUN cp docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh \
    && chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

# 健康检查：命中全局前缀下的 /api/v1/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
