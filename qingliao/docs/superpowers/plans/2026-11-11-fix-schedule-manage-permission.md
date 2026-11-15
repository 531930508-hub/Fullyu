# 排班管理权限修复记录（店长被挡 + 跨店调店）

**日期:** 2026-11-11
**环境:** 测试环境 `mall-test.fullyu.cn`（后端 `121.40.119.57:/opt/fullyu-mall-test`，测试库 `tou_mall_test`）
**现象:** 店长账号（如 柠萌 Mia，`ums_admin` 24 / 疗愈师档案 12，角色「店长 + 疗愈师」）在排班管理里做任何写操作都返回“请由门店管理人员操作排班”；店长给本店疗愈师做临时调店（targetShopId 非授权门店）时提示无门店权限。

## 根因

`MassagistSchedulesController#requireManage` 用“有没有疗愈师档案”来区分「疗愈师本人」和「门店管理人员」：

```java
if (access.currentAdmin().getMassagistId() != null && !access.isGlobal())
    throw new BusinessException("请由门店管理人员操作排班");
```

店长本身也是疗愈师，必然有疗愈师档案，所以这条判断把所有店长都挡在排班管理之外。`saveOrUpd / saveTargetShop / batchTargetShop / batchAdd / clearFuture / changeLogs` 都走这条守卫。

调店目标门店那一侧同样把目标门店当成“自己的门店”去校验，店长把本店疗愈师临时调往其它门店属于正常操作，却被 `requireShopAccess` 拦下。

## 改动

| 文件 | 改动 |
|---|---|
| `incentive/service/IncentiveAccessService.java` | 新增 `canManageSchedules()`、`requireTransferShopAccess(shopId)`、`hasRoleName/ hasRoleIn`；`isShopManager()` 查身份表加 try/catch，身份表未迁移的库按“非店长”处理而不是 500；新增开关 `incentive.shop-manager-roles`（默认 `店长`） |
| `controller/MassagistSchedulesController.java` | `requireManage` 改用 `canManageSchedules()`；目标门店校验拆出 `requireManageTarget()`，改用 `requireTransferShopAccess()` |
| `test/.../ScheduleManagePermissionTest.java`（新增 8 个用例） | 未绑档案的管理账号/全局角色/店长角色/店长身份放行；疗愈师被挡；身份表异常降级；店长跨店调店放行、他人目标门店仍拦截；经理判断查询次数 |
| `test/.../SchedulePermissionTest.java`（新增 3 个用例） | 同上守卫的控制器级回归 |

放行口径：全局角色（超级管理员/总助/运营/财务/admin）→ 放行；后台角色含「店长」→ 放行（兼容只配了 `ums_role`、还没落身份表的历史账号）；店长身份（`f_massagist_identity.SHOP_MANAGER`）→ 放行；未绑定疗愈师档案的管理账号 → 放行；其余（纯疗愈师）→ 仍然拦截，文案不变。

## 测试

- 定向单测：`ScheduleMutationTest`、`SchedulePermissionTest`、`ScheduleManagePermissionTest`、`ScheduleQueueTest`、`AdminShopContextTest`、`TrainingRecordPageTest`、`ServiceDurationAccessTest`、`IncentiveExportTest` 共 **51 个用例全绿**（`-DskipTests=false -Dtest=...`）。
- 测试环境端到端（临时账号，验收后全部清理，`ums_admin`/`s_massagist` 计数回到 49/32）：
  - 店长（角色 店长+疗愈师，绑定疗愈师档案）：`changeLogs` 返回 200；`saveTargetShop` 把本店疗愈师调到 8 号店返回 200 并落一条调店记录。
  - 纯疗愈师（只有 疗愈师 角色 + 档案）：`changeLogs`、`saveTargetShop` 仍返回「请由门店管理人员操作排班」。
  - 超管 `testadmin`：`changeLogs` 仍 200。

## 部署与回滚

- 构建：服务器上 `cd /opt/fullyu-mall-test/src/tou-mall-server && mvn -o -pl mall-admin -am -DskipTests package`（本机无 JDK，构建在测试服务器完成，`~/.m2` 已可离线）。
- 备份：`/opt/fullyu-mall-test/backups/mall-admin-before-schedperm-20261111-1112.jar`（311MB，改动前版本）。
- 重启：`/opt/fullyu-mall-test/start-backend.sh`；重启后 `curl 127.0.0.1:19929/admin/info` 返回 `code=401` 即视为存活，日志里 `Started MallAdminApplication` 约 55 秒。
- **操作提醒:** 该进程收到 SIGTERM 后 Web 端口会释放，但 JVM 不退出（遗留非守护线程），必须 `kill -9` 收尾；否则会同时跑两个实例（旧实例的定时任务继续执行、日志串写）。重启务必 `pgrep -f mall-admin-1.0-SNAPSHOT.jar` 确认为 1 个进程。
- 回滚：把上面的备份 jar 拷回 `mall-admin/target/mall-admin-1.0-SNAPSHOT.jar`，按同样步骤重启。

## 备注

- 测试库 `tou_mall_test` 是本地 MySQL（`config/application-test.yml` 指向 `127.0.0.1:3306/tou_mall_test`），服务端口 `127.0.0.1:19929` 由 nginx 反向代理到 `/api`。
- `ums_admin` 在测试库没有 `massagist_id` 列，`currentMassagistIdOrNull()` 靠 `s_massagist.ums_admin_id` 反查；`getAdminByUsername` 会把账号对象缓存到 Redis（`mall:ums:admin:<username>`，db9），改名/重建同名账号时旧缓存会覆盖新数据，验收脚本里遇到过，清理缓存键后复现正常。
- 本次未改 `/admin/info` 的 `shopManager` 标识（仍按身份表计算，只用于手机端考核入口），排班页按菜单权限进入。