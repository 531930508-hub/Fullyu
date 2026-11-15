# Full愈 平台单仓库

一个仓库管理 Full愈 旗下全部在运行的业务代码；每个业务是独立的 pnpm workspace，互不共享依赖锁，可单独安装、构建、部署。

| 目录 | 业务 | 线上入口（正式名） | 服务器 | 形态 | 技术栈 |
|---|---|---|---|---|---|
| `presence/` | 在场 / 轻疗（Full愈 主应用） | `presence.fullyu.cn` | 120.55.36.3 | 小程序 + H5 + 后台 + API | uni-app(Vue3) + Ant Design Vue + NestJS + Prisma |
| `shixu/` | 时叙（茶饮零售） | `teahour.fullyu.cn` | 121.40.119.57 | 小程序 + 后台 + API | 自有前端 + NestJS |
| `crm/` | 品牌会员 CRM | `crm.fullyu.cn` | 121.40.119.57 | 后台 + 小程序 + 游戏化模块 | React + NestJS |
| `qingliao/apps/miniprogram` | 轻疗小程序（appid `wxeb4e8a99b7eeebf8`） | 微信小程序（单独编译上传） | — | 小程序 | uni-app(Vue3) |
| `qingliao/tou-mall-server` | 轻疗商城后台 API（admin / portal） | `cityretreat.fullyu.cn`（旧名 `manage.fullytherapy.com`） | 8.133.6.18 | 双 Spring Boot 服务 | Java 8 + Spring Boot + MyBatis-Plus |
| `qingliao/tou-mall-admin-web` | 轻疗商城管理后台前端 | 同上 | 8.133.6.18 | 静态站点 | Vue2 + Element UI |

> 域名唯一事实源是 `docs/deploy/domains.tsv`，本表只是索引；两者冲突以 tsv 为准。
> `qingliao/full-yu-mini`（Vue2 旧版）与 `qingliao/full-yu-mini2`（Vue3 快照）两份镜像已删除：它们停在 2025-12 / 2026-02，与现行源码分别差 4 / 86 处，CI 也不构建它们，保留只会让改动落到错的副本。现行小程序源码已作为 `qingliao/apps/miniprogram` 入库（与旧 `Full愈-轻疗/full-yu-mini2` 逐字节一致）。
> 需要查历史用 `git archive 32af4a4 qingliao/full-yu-mini2 | tar -x -C /tmp`，或 `git show 32af4a4:qingliao/full-yu-mini/<path>`。

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
  - 轻疗商城 ECS：`/etc/fullyu/qingliao-mall.env`（本机原件：`~/.fullyu-secrets/qingliao-tou-mall-server.env`）
- 新增环境变量时，同步更新对应目录的 `.env.example`，并在文档里写清用途与取值范围。

## 部署

- **在场**：根目录 `.github/workflows/ci-deploy.yml`，push 到 `main` 触发构建 + 部署到 ECS。
  - 部署步骤默认关闭，需在仓库 `Settings → Variables` 设置 `ENABLE_DEPLOY=true` 后才执行，避免迁移期误触生产。
  - 需要在 `Settings → Secrets` 配置：`ECS_HOST`、`ECS_USER`、`ECS_SSH_KEY`、`SERVER_PATH`、`ADMIN_DIST_PATH`、`H5_DIST_PATH`、`PM2_APP`。
- **时叙 / CRM**：见各自目录下的 `deploy/` 或 README；目前手工部署，后续按需接入同一套 workflow。
- **轻疗商城（tou-mall）**：见 `qingliao/tou-mall-server/DEPLOY.md`。手工部署，**必须**先注入环境变量
  （数据库/OSS/SMS/微信/汇付支付密钥均已从仓库移出，缺失时不会报错、只在调用第三方时失败）。

## 分支约定

- `main` 只接受可部署的合并；日常开发走 `feat/*` 或 `fix/*`。
- 提交信息：`type(scope): 说明`，如 `fix(presence): 修复券码兑换竞态`。
- 大文件（图片素材、合同、报表）不入库，放对象存储或各自的文档库；仓库只存代码与必要的小体积资源。

## 历史

`presence/`、`shixu/` 通过 `git subtree` 并入，保留了原仓库的完整提交历史（`git log --follow presence/apps/server/src/...` 可追溯）。

迁移前的独立目录（`~/Desktop/Full愈`、`~/Desktop/Full愈-时叙`、`~/Desktop/Full愈-CRM`、`~/Desktop/Full愈-轻疗`）已于 2026-11-15 收口，桌面不再保留工作副本：

- `presence`/`shixu`/`qingliao`/`ops` 四个独立仓的**已提交内容**与本仓库对应目录逐字节一致，已无独有提交。
- 轻疗差异仅在两处：`PayCert`/`SendSMS`/`application.yml` 已把明文值改为 `Env.get(...)`；明文原件抽到 `~/.fullyu-secrets/qingliao-legacy/`（见其 README）。
- **未完成**：`Full愈-CRM` 的未提交 WIP 只回灌了台账推荐人、资料回写、统一大会员两档；时叙每杯立减 / 轻疗提前价 / 全品牌权益（`ALL_BUSINESS`）、admin 静态页与 seed、相关文档仍在 `~/Desktop/资料/代码归档/git-bundles/Full愈-CRM-wip-20261116.bundle` 的 `wip:` 提交里，尚未并入 `crm/`。回灌前不要删除该 bundle（对应补丁 `~/Desktop/资料/交接收件箱/_inbox-20261116/crm-wip-20261116.patch`）。
- 各仓 git 历史打成 bundle：`~/Desktop/资料/代码归档/git-bundles/*.bundle`（`git clone <bundle>` 可随时还原，已验证）。
- 轻疗旧开发目录整体打包：`~/Desktop/资料/代码归档/Full愈-轻疗-20261115.tar.gz`（含设计稿、UI 素材、历史 demo）。