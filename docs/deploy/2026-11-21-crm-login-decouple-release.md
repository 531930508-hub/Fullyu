# 2026-11-21 会员中心故障不再阻断登录（三端解耦）— 发布计划与记录

commit `226db35`（main）；涉及变体：presence / shixu / qingliao（mall + mini）。

## 1. 发布计划

| 变体 | 改动内容 | 产物 | 环境与顺序 | 依赖/前置 | 回滚 |
|---|---|---|---|---|---|
| presence | `auth` 登录不再等 CRM 同步；`common/crm/crm-breaker.ts` 熔断；`brand-member.*`/`brand-perks` 降级 | server `dist` + admin `dist` + 小程序体验版 | 测试(test-presence) → 生产(CI：push main 自动 tsc+pm2) | CI 走 GitHub Actions（`ci.yml` presence job），本次随 main push 自动触发 | CI：rsync 回上一版 dist + pm2 restart；小程序重传上一版产物 |
| shixu | `auth.service` 登录解耦；`crm/crm-breaker.ts`；积分/会员卡「同步中」 | server `dist` + admin `dist` | 测试(test-teahour) → 生产(121.40.119.57 手工：tar/scp/覆盖/prisma generate/restart) | 生产需 `sudo -u teahour` 跑 prisma generate（见 §4 事故 2） | `/root/backups/shixu-{server,admin}-dist-<ts>.tar.gz` 解回后 restart `teahour-api` |
| qingliao-mall | `CrmCircuitBreaker`、`CrmClient` 超时/降级、`CrmSyncService`、`BrandMemberClient`、`CustomerService` 登录解耦 | jar `mall-admin-1.0-SNAPSHOT.jar`（sha256 `14d23654…`） | 测试(test-cityretreat，`scripts/deploy-test.sh`) → 生产(120.55.36.3，`scripts/deploy-prod.sh`，按 §4 台账) | 生产 env 29 键齐全；DB 快照在测试机 | `/server/java/fully/backup/20261121-035248/`；`bash start-120.sh` |
| qingliao-mini | 会员中心页面「同步中」态、`utils/memberSync.js`、i18n | mp-weixin 产物 | **未上传**（见 §4 待办 1） | 缺 `wxeb4e8a99b7eeebf8` 的上传私钥；本机 miniprogram 缺 `uni` CLI（`@dcloudio/vite-plugin-uni` 未列入 package.json） | 重传上一版产物 |
| teahour-mini | 首页会员卡「同步中」态 | mp-weixin 产物 | **未上传**（见 §4 待办 1） | 缺 teahour 小程序上传私钥 | 重传上一版产物 |

不进本窗口：crm（本窗口无改动）；qingliao admin-web 与 `tou-mall-server` 的未提交 WIP（个税 20261124/1125）保持未动，未随本次发布。

## 2. 验证证据

**静态/单测（G0）**
- `scripts/release-check.sh`：worktree 与 main 两处均 PASS。
- presence：`tsc -b` OK；`npx tsx --test` 全绿（含新增 `test/crm-breaker.spec.ts`、`test/crm-client.spec.ts`）；admin `vite build`（内含 vue-tsc）OK。
- shixu：`vue-tsc` OK；`npx tsx --test` 全绿（含新增 `crm/crm-breaker.spec.ts`）；admin `vite build` OK。
- qingliao：`tests/memberSync.test.mjs` 全绿（降级判定/超时/兜底分支）。

**运行态（G1，测试环境）**
- test-presence / test-teahour 公网 `/health` 200；test-mall 发布脚本内探针 200、实例数 1。
- presence 测试环境 CRM/BrandCRM 为关闭态（`domains.tsv`），故降级路径在该环境不会被触发，仅验证「不阻断登录」的代码路径与构建产物一致。

**降级可观测性（G2）**
- 降级时不抛错、不阻塞登录；会员卡/积分展示「同步中」并带可重试入口；熔断器半开恢复后自动转正常文案。
- 未做生产故障演练（人工砍 CRM 会波及 CRM 本身），以单测 + 代码路径核验代替；生产日志无新增 ERROR 指纹（qingliao 冒烟 `ERROR 计数 0`）。

**生产冒烟（发版后）**
presence `/api/v1/health` 200、teahour `/api/health` 200、cityretreat `/api/product/list` 200、manage 首页 200、shixu/presence 进程 online/active 且 dist 内含 `crm-breaker`/`degraded`。

## 3. 发布记录

| 时间(11-21) | 动作 | 结果 |
|---|---|---|
| 03:34 | 三分支 rebase 到 origin/main 后 push（c1f6535→226db35） | ff-ok |
| 03:35 | test-presence（tar 备份 `test-presence-20261121-033452.tar.gz`） | 200 |
| 03:36 | test-teahour（备份 `test-teahour-20261121-033531.tar.gz`）；presence CI 自动上线（pm2 restarts 20, dist 含 `degraded`） | 200 |
| 03:40 | test-mall `deploy-test.sh`（对账 PASS，jar 03:37 构建） | 200 / 实例 1 |
| 03:47 | shixu 生产覆盖 + restart | 首次起失败（§4 事故 2），chown 后 active，200 |
| 03:48 | qingliao 生产第一次 `deploy-prod.sh` | 安全中止（§4 事故 1） |
| 03:52–03:56 | qingliao 生产重试换 jar（release_dir `20261121-035248`） | HEALTH_OK、冒烟 4/4、ERROR 0 |
| 03:56 | `mp-upload` 上传 presence 小程序体验版 `1.0.20261121` | 成功 |
| 03:56–03:57 | release-tag：`prod-presence-20261121-0356`、`prod-shixu-20261121-0356`、`prod-qingliao-mall-20261121-0357` | 已推送 |

## 4. 事故与待办

1. **qingliao 生产 JVM 于 03:47:09 收到 SIGTERM 自行退出（8 分钟不可用）**。时间点与第一次 `deploy-prod.sh` 的 297MB 上传重叠，但脚本在该阶段只做 sha 校验，`stop_app` 在 PID 校验之后，未执行到；nginx error 首批 03:47:30 `no live upstreams`，应用日志为优雅 shutdown（Druid 正常 close），无 OOM 记录，health-check cron 只告警不重启。根因未定位（当前只有 Jenkins agent 一个系统 java 进程，应用为 `nohup` 启动、无 systemd 托管，`ps -C java` 在某些时刻看不到实例是部署脚本第一次误判「没在跑」的原因）。**03:55 手动 `start-120.sh` 恢复**，03:52 重试成功换 jar。建议：给 mall 补 systemd/守护 + 明确谁在 03:47 发过 SIGTERM（3 个已登录会话中可能有人在操作）。
2. **shixu prisma 权限事故（发版过程中，已自愈）**：root 执行 `npx prisma generate` 把 `.prisma/client/*` 写成 root:root，服务用户 `teahour` 加载 `libquery_engine` 报 EACCES，首次起失败。修复：`chown -R teahour:teahour …/.prisma/client` 后 restart。**规程补丁：prisma generate 必须 `sudo -u teahour` 执行。**
3. **待办**：shixu 与 qingliao 小程序体验版未上传——缺对应 appid 上传私钥（`~/.fullyu-secrets/mp-upload` 只有 presence 的）；qingliao miniprogram 缺 `uni` CLI（`@dcloudio/vite-plugin-uni` 未声明依赖）。在补齐前，这两个小程序仍跑旧版，会员卡在 CRM 故障时仍可能显示空白。
4. qingliao `admin-web` 与 `tou-mall-server` 的个税 WIP 未提交，本次未动；下次发布需先按 `跨系统时间口径手册` 收口。