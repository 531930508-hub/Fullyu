# Full愈 平台 · 协作入口（AI 与人都先读这一页）

本仓库把 Full愈 旗下 5 个发布单元放在一个 monorepo 里：`presence/`（在场）、`shixu/`（时叙）、`crm/`（品牌会员）、`qingliao/apps/miniprogram`（轻疗小程序）、`qingliao/tou-mall-*`（轻疗商城）。

- **跨项目规则看本文件 + `docs/deploy/发布与分支规范.md`**（分支、发布、部署、回滚、tag 记账）。
- **项目内细则**：时叙另见 `shixu/AGENTS.md`；在场另见 `docs/deploy/发布标准流程.md`；轻疗见 `qingliao/docs/`。两层冲突时从严。
- **事实源**：域名/机器/端口只有 `docs/deploy/domains.tsv` 一个来源；凭据只在 `~/.fullyu-secrets/`，不进仓库、不进日志、不进聊天记录。
- **运维现场经验**（清盘、备份保留、rsync 不带 `--delete`、pm2 与 systemd 抢端口）在个人记忆库与 `deploy/`，改服务器前先读。

## 1. 五个动作必须分开说

| 动作 | 含义 | 碰生产？ | 是否需要用户明确授权 |
|---|---|---|---|
| **提交** | `git commit`，只进本地历史 | 否 | 不需要 |
| **推送** | push 到远端；**不等于上线** | 否 | 不需要，但必须说清推的是哪条分支 |
| **发布** | 产出可部署产物（构建 + 打包 + 指纹） | 否 | 不需要 |
| **部署** | 产物落到某个环境 | **是** | **必须**，且要指明环境（生产/测试） |
| **验收** | 探针证据（HTTP 码、md5、版本号），不是"应该好了" | 只读 | 部署后必做 |
| **回滚** | 恢复到上一版产物/commit | **是** | 事故时先回滚止损，再定位 |

没有部署授权，就停在"发布完成 + 产物路径 + 回滚方式"。**禁止**把"构建通过"说成"已上线"。

## 2. 四条硬规则

1. **`main` 是唯一可发布分支。** 系统边界靠目录和 CI 的 `paths`，不靠分支。发布单位是 `(项目, commit)`，每次生产发布打 `prod-<项目>-<时间>` tag。历史分支不得用于发布（布局对不上、落后 main、CI 不触发）。
2. **服务器不是源码副本。** 改代码只能走"本地 → Git → 部署通道"，不许 SSH 上去改文件救火（`.env` 除外）。服务器上允许与仓库不同的只有：`.env*`、`node_modules`、上传/备份目录。其他任何差异按事故处理。
3. **没有证据不算完成。** 收尾必须给出：目标环境、commit、CI/构建结论、探针前后值、回滚命令、遗留人工项。
4. **小程序环境只由运行时 `envVersion` 决定，生产包禁止被编译期注入改写。** 三个小程序（在场 `presence/apps/miniprogram`、时叙 `shixu/apps/miniprogram`、轻疗 `qingliao/apps/miniprogram`）必须保持：`release` → 生产域名，`trial/develop` → 测试域名；`import.meta.env.PROD` 构建一律忽略 `VITE_API_BASE`（只允许 dev 构建注入）。发布构建必须串 `scripts/mp-release-gate.mjs`（在场 `build:mp-weixin`、时叙 `build:mp-weixin`、轻疗 `build:mp`）；测试包禁止上传、提审、发布。改请求层必须同步跑各自的环境回归测试（`env-switch.test.cjs` / `envSwitch.test.mjs`）。2026-11-24 在场测试包被发布成正式版、线上读测试库，就是踩了这条。

## 3. 做什么之前先跑一遍

```bash
scripts/release-check.sh --project presence     # 或 shixu / crm / qingliao-mini / all
```

它会检查分支名、工作区、与 `origin/main` 的同步状态，并按项目跑构建（加 `--full` 跑测试）。红了不许合 main。

## 4. 分支只有两类

- 短期改动：`<feat|fix|chore|docs|hotfix>/<scope>-<yyyymmdd>`，寿命 ≤ 7 天，**合并即删**（本地 + 远端）。
- 长期搁置确实要留：`parked/<scope>-<yyyymmdd>`，必须写明负责人和复查日期，30 天内处理掉。

**禁止**再造 `split/*`、`merge/*`、`release/*` 这类"按系统分的影子分支"——它们不是隔离，是同一棵树的重复快照，2026-11-15 已清理（证据与归档见 `docs/deploy/发布与分支规范.md` §7）。

要同时开两个系统做开发，用工作目录隔离，不用分支：

```bash
git worktree add ../wt-shixu main
git worktree add ../wt-presence main
```

## 5. 绝对不能做

- 从历史分支、桌面旧副本、`~/Desktop/Full愈-*` 之类目录构建或发布。
- `rsync --delete` 覆盖 web 根；手工 `cp -a` 做备份（用 `deploy/scripts/backup-dist.sh`）。
- 为了提交脚本去合并别人未提交的改动；强推 `main`。
- 在服务器上 `git pull`（那里不是 git 仓库）、`migrate dev` / `migrate reset`。
- 把密钥、手机号、真实订单数据写进仓库、文档或截图。

## 6. 收尾格式

```
目标环境 | commit | 构建/CI 结论 | 探针前后值 | 回滚命令 | 遗留人工项
```