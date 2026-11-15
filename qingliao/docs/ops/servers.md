# 服务器与部署信息清单

> 用途：新会话/新同事接手时，不必再翻聊天记录。**只记主机、路径、端口、库名；密码不写在这里**。
> 最后核对：2026-11-11（DNS 实测 + 登录验证 + 端到端发布跑通）

## 1. 主机一览

| 主机 | 角色 | 依据 |
|---|---|---|
| `121.40.119.57`（`mall-test.fullyu.cn`） | **轻疗测试环境** | DNS 实测；登录验证 `/opt/fullyu-mall-test` 存在 |
| `47.111.136.49`（私网 `172.19.180.137`） | Redis + RabbitMQ；同机跑 CRM | `application-prod.yml`、`docs/crm-integration.md` |
| `8.133.6.18` | **生产应用机**，jar 在 `/server/java/fully/`，端口 9929，nginx 在 `/etc/nginx/conf.d/fully.conf` | 2026-11-13 已登录核实（4 核/7G/99G，无 crontab、无自动备份）；**不要当测试机用**。上线流程见 [生产上线手册](生产上线手册.md) |

本机已配 `~/.ssh/config` 的 `Host mall-test`（密钥 `~/.ssh/id_ed25519_malltest`），免密登录。

## 2. 测试机（121.40.119.57）

| 项 | 值 |
|---|---|
| 源码（rsync 自本机） | `/opt/fullyu-mall-test/src/tou-mall-server` |
| jar | `src/tou-mall-server/mall-admin/target/mall-admin-1.0-SNAPSHOT.jar` |
| 启动脚本 | `/opt/fullyu-mall-test/start-backend.sh`（`--spring.profiles.active=test`，端口 **19929**） |
| 服务器 JDK/Maven | `/usr/bin/java` 17.0.12、`/usr/bin/mvn` |
| 环境变量 | `crm.env`(600)、`.env`、`.rds.cnf`；启动脚本里 `INCENTIVE_TEAM_CERT_ENABLED=true`、`-Duser.timezone=Asia/Shanghai`（2026-11-13 补，之前每次巡检都在报缺这个参数） |
| 看护 | `bin/backend-guard.sh`，root crontab `*/2 * * * *`：进程没了就拉起，日志 `logs/backend-guard.log`；发布期间靠 `$APP_DIR/.deploy.lock` 避让 |
| 后台前端 | `admin-dist/`，nginx `/mall-admin/` |
| 备份 | `backup/deploy-<时间戳>/`、`backup/jar-*.jar` |
| 日志 | `logs/app.log` |
| Jenkins | `/var/jenkins`，job：`Full愈大会员后端部署`、`Full愈大会员管理端前端部署` |

## 3. 数据库 / 中间件

| 项 | 值 |
|---|---|
| RDS | `rm-bp127cdsipvc7dtseno.mysql.rds.aliyuncs.com:3306` |
| 库 | `tou_mall_test`（测试）、`tou_mall_current`（生产）、`tou_mall_demo`（dev 默认） |
| Redis / RabbitMQ | `47.111.136.49` |
| CRM | `47.111.136.49`，systemd `fullyu-crm`，私网 `172.19.180.137:8898`，数据 `/opt/fullyu-crm/data/crm.db` |

## 4. 发布

```bash
cd tou-mall-server
./scripts/deploy-test.sh              # rsync → 停应用 → 服务器打包 → 启动 → 健康检查（实测约 3 分钟）
./scripts/deploy-test.sh --with-web   # 后端 + 管理端前端：本机 npm run build:test → 备份 admin-dist → rsync → 首页校验
./scripts/deploy-test.sh --status     # 只看 jar 时间/进程/端口/开关/前端静态文件
```

不经过 GitHub。2026-11-11 实测跑通：备份 → TERM 强杀 → `build-exit: 0` → 54s 就绪 → 实例数 1。
`--with-web` 需本机有 `tou-mall-admin-web/node_modules`（缺了会提示 `npm ci`），前端产物走 `BASE_API=https://mall-test.fullyu.cn/api`，回滚包在 `backup/deploy-<时间戳>/admin-dist.tgz`。

脚本自带中断兜底（2026-11-13 补）：只要走到「已停应用」，后续任何一步失败或 Ctrl-C 都会自动恢复
`backup/deploy-<时间戳>/` 里的旧 jar 并重新拉起，健康检查 200 后才退出（实测中断后 2 分钟内自愈）。

## 5. 四个真实故障（脚本已堵住）

| 故障 | 现象 | 根因 |
|---|---|---|
| 边跑边就地 `mvn package` | 随机接口 500，日志 `NoClassDefFoundError: ModelAndViewDefiningException`（实测 `/shop/list`） | jar 被替换后运行中的 JVM 懒加载类失败 → 先停应用再打包 |
| 旧进程杀不掉 | 两个 JVM 并存、定时任务重复 | `-Dfullyu.test-mode` 下 SIGTERM 无效 → TERM 15s 后 `kill -9` |
| `pgrep -f 'mall-admin...jar'` | 误杀自己的 ssh 会话 | 命令行含 jar 名的 shell 也被匹配 → 改用 `ps -C java` 再按 jar 名过滤 |
| **停完没起来** | 2026-11-13 20:54 发布中断，后端停到 21:37，全站 502 持续 40 分钟；只有 `brand-crm-watch.sh` 21:07 那条「轻疗进程不存在」报警 | 停服和启动之间没有任何保护 ⇒ `deploy-test.sh` 加了 EXIT trap（`PHASE=stopped` 失败→恢复备份 jar 并拉起；`PHASE=started` 失败→回滚 `admin-dist`）；另有 `bin/backend-guard.sh` 每 2 分钟兜底 |

**拉起后端必须二次 fork**：`setsid --fork nohup ... &`（并 `9>&-` 关掉看护的 flock fd）。
普通 `&` 或前台执行时，JVM 是脚本的子进程，bash 退出会一直等它 ⇒ ssh 通道不关闭、
`deploy-test.sh`/cron 看护双双挂死，flock 也一直被占（2026-11-13 实测卡了 8 分钟才发现）。

另有：Jenkins 若有 GitHub 触发的流水线在跑，会与手动发布争同一个 jar，发布前先 `--status` 看"构建中"。
（2026-11-11 核查：`jenkins.fullyu.cn` 返回 502，测试机上的 remoting agent 未连上控制器、无在跑的 mvn，两个部署 job 当前不会触发。）

## 6. 测试基线

`mvn -pl mall-admin -am -DskipTests=false -Dtest='!OssServiceImplTest' test`：**614 用例 0 失败**（2026-11-11 修复了 `SalaryRecordAccessTest` 3 个红用例；`AdminNoticePortalCryptoTest` 已自行恢复绿）。绝不跑 `OssServiceImplTest`（会访问真实 OSS）。

## 7. 风险项

`服务单项目说明.md:115-126` **明文写着两台机器的 root 密码**，含 `8.133.6.18`（主服务）。建议挪到服务器 `*.env`(600) 或个人密码管理器，仓库只留主机+路径，改密后同步更新该文件。