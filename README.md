# Full愈 平台单仓库

一个仓库管理 Full愈 旗下全部在运行的业务代码；每个业务是独立的 pnpm workspace，互不共享依赖锁，可单独安装、构建、部署。

| 目录 | 业务 | 形态 | 技术栈 |
|---|---|---|---|
| `presence/` | 在场 / 轻疗（Full愈 主应用） | 小程序 + H5 + 后台 + API | uni-app(Vue3) + Ant Design Vue + NestJS + Prisma |
| `shixu/` | 时叙（茶饮零售） | 小程序 + 后台 + API | 自有前端 + NestJS |
| `crm/` | 品牌会员 CRM | 后台 + 小程序 + 游戏化模块 | React + NestJS |
| `qingliao/` | 轻疗（历史 uni-app 小程序存档） | 小程序源码 + 说明文档 | uni-app(Vue2) |

## 快速上手

```bash
# 首次
git clone git@github.com:<your-account>/fullyu-platform.git
cd fullyu-platform

# 各业务独立安装与构建（在各自目录内执行，不要在本根目录执行 pnpm install）
cd presence && pnpm install --frozen-lockfile && pnpm --filter @fullyu/server build
cd ../shixu && pnpm install --frozen-lockfile
cd ../crm   && pnpm install --frozen-lockfile

# 本地开发（在场）
cd presence
pnpm --filter @fullyu/server dev      # API :3000
pnpm --filter @fullyu/admin dev       # 后台 :5173（/api 代理到 3000）
pnpm --filter @fullyu/miniprogram dev:h5
```

## 环境变量与密钥（重要）

- 所有 `.env` / `.env.local` / `*.secret` / `*账号密码*` / `*密钥*` / `*.pem` / `*.key` 已在根 `.gitignore` 屏蔽，**永远不要提交**。
- 每个业务只提交 `.env.example`，真实值分别放在：
  - 在场 ECS：`/root/fullyu/presence/apps/server/.env.local`（600）
  - 时叙 ECS：`/etc/teahour/api.env`
  - CRM ECS：`/etc/fullyu-crm/crm.env`
- 新增环境变量时，同步更新对应目录的 `.env.example`，并在文档里写清用途与取值范围。

## 部署

- **在场**：根目录 `.github/workflows/ci-deploy.yml`，push 到 `main` 触发构建 + 部署到 ECS。
  - 部署步骤默认关闭，需在仓库 `Settings → Variables` 设置 `ENABLE_DEPLOY=true` 后才执行，避免迁移期误触生产。
  - 需要在 `Settings → Secrets` 配置：`ECS_HOST`、`ECS_USER`、`ECS_SSH_KEY`、`SERVER_PATH`、`ADMIN_DIST_PATH`、`H5_DIST_PATH`、`PM2_APP`。
- **时叙 / CRM / 轻疗**：见各自目录下的 `deploy/` 或 README；目前手工部署，后续按需接入同一套 workflow。

## 分支约定

- `main` 只接受可部署的合并；日常开发走 `feat/*` 或 `fix/*`。
- 提交信息：`type(scope): 说明`，如 `fix(presence): 修复券码兑换竞态`。
- 大文件（图片素材、合同、报表）不入库，放对象存储或各自的文档库；仓库只存代码与必要的小体积资源。

## 历史

`presence/`、`shixu/` 通过 `git subtree` 并入，保留了原仓库的完整提交历史（`git log --follow presence/apps/server/src/...` 可追溯）。

本地仍保留迁移前的独立目录（`~/Desktop/Full愈`、`~/Desktop/Full愈-时叙`、`~/Desktop/Full愈-CRM`）作为冷备，确认无误后可自行删除。