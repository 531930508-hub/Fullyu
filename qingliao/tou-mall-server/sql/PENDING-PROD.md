# 生产待执行 DDL（发版前必须做完）

> 2026-11-11 建立。触发原因：测试环境上线了带 `Customer.birthday` 的代码，但库没加列 →
> MyBatis-Plus 把 `birthday` 拼进每一条客户查询 → 全站 `Unknown column`。测试库已补。
>
> **2026-11-11 核验后更正**：原来记的"生产缺 3 个列"是低估。生产机的 jar 是
> **09-12 构建**（进程 2026-10-15 02:02 起），代码落后约两个月，
> 生产库 `tou_mall_current` 相对 `sql/` 缺 **92 个对象（19 个脚本）**。

## 一、生产现状（2026-11-11 只读核验）

| 项 | 值 |
|---|---|
| 主机 | 8.133.6.18（`iZuf65vldmwxpfmvbfzjh9Z`，已装部署公钥 `fullyu-deploy@Mac`） |
| 运行 | `java -Dspring.profiles.active=prod -jar mall-admin-1.0-SNAPSHOT.jar`，PID 1635289，2026-10-15 起 |
| jar 构建时间 | `mall-admin-1.0-SNAPSHOT.jar` = **09-12 01:30** |
| 数据库 | 阿里云 RDS `tou_mall_current`：123 张表、9977 位客户 |
| 差距 | 92 个对象 / 19 个脚本（清单见下） |

## 二、演练结论（已在生产库的影子副本上验证）

做法：`mysqldump --no-data tou_mall_current` → 导入测试机 `tou_mall_prodcopy` →
按文件名顺序执行 `sql/prod/*.sql`（25 个，跳过 future 脚本）→ 连跑两遍。

- 第一遍：**0 失败**；第二遍：**0 失败**（可重复执行）
- 执行后结构 123 表 → **156 表 / 1572 列**，`./scripts/sql-audit.py --db tou_mall_prodcopy` → **✅ 一致**
- 影子库留在测试机 `tou_mall_prodcopy`，确认后可 `DROP DATABASE tou_mall_prodcopy`

演练顺带修掉 4 处脚本缺陷（测试库因历史状态把问题掩盖了，生产会真炸）：

1. `2026-11-09-massagist-identity-approval-flow.sql` 依赖 `s_massagist.is_trainer`，
   而该列由排在其后的 `training-team-cert.sql` 创建 → 加列存在性判断，缺列时跳过种子
2. `2026-11-26-member-card-advance-only.sql` 写的表名是 `customer_member_card`（少了 `c_`）
3. `2026-10-21-incentive-v5.sql`、`2026-11-07-reception-cap.sql` 是无守卫的 `ADD COLUMN`，
   第二次执行必报 `Duplicate column` → 改成 `information_schema` 判存量的幂等写法
4. `2026-11-08-coupon-notices.sql` 的守卫写成了 `DATABASE() = '...'`（带空格），
   生成生产版时漏转 → 生成器改用正则

## 三、现在能不能先上？（2026-11-11 结论：只跑一部分没意义，等统一发版）

**纯 DDL 部分对现网零影响**，已逐条核对：

| 检查项 | 结果 |
|---|---|
| `ADD COLUMN ... NOT NULL` 且无 `DEFAULT` | 0 个（唯一会让旧代码 INSERT 报错的写法） |
| `MODIFY` / `CHANGE` / `DROP` / `TRUNCATE` / `RENAME` | 0 个 |
| RDS 版本 / 表量 | MySQL 8.0.36；最大表 `oms_order_detail` 43,263 行、`s_order` 41,715 行 → 加列/建表/普通索引 instant 或 online |
| 旧 jar 是否感知 | 否。MyBatis-Plus 按实体列名显式查询，多出的列/表对 09-12 的代码透明 |

**但 4 个脚本会立刻改生产后台，必须和新前端一起上**：

| 脚本 | 动作 |
|---|---|
| `2026-11-10-admin-menu-ia.sql` | `DELETE FROM ums_menu`（现 44 行全清）→ 重写 50 行新 IA；`DELETE FROM ums_role_menu_relation`（现 136 条全清）→ 按新菜单重发 |
| `2026-11-11-admin-menu-tabs.sql` | 增删页签 |
| `2026-11-11-customer-tag-menu.sql` | 新增「标签管理」菜单 |
| `2026-11-09-remove-member-card-integration-menu.sql` | 删 `memberCard` / `integration` 菜单 |

依据：生产管理端 `manage.fullytherapy.com` → `/server/www/fully/dist/`，构建于 **09-12 01:55**；
其 bundle 里 `serviceDuration` 存在，但 `appointmentList`、`incentiveBoard`、`therapistStats`、
`customerTag` **均不存在**，也没有 `menu/list` 类接口（菜单写死在前端，DB 只驱动权限）。
现在跑菜单脚本 → 新菜单点进去空白、旧菜单名被删导致权限匹配不上。

好消息：脚本硬编码的角色 id 5~12 与生产 `ums_role`（5 超级管理员 … 12 客服）**完全一致**，
发版当天整表重建不会把管理员锁在门外。

其余夹带数据的脚本（会员卡配置、激励参数种子、`reception_cap_percent=20`、身份/培训回填等）
旧 jar 都不读，无影响。

## 四、生产执行步骤

**顺序：先 DDL，后换 jar。** 新增列/表对 09-12 的旧 jar 向后兼容，可以先跑。

```bash
cd tou-mall-server

# 0) 备份（RDS 控制台做一次快照更稳）
ssh -i ~/.ssh/id_ed25519_fullyu root@8.133.6.18 \
  'mysqldump ... tou_mall_current > /root/backup-tou_mall_current-$(date +%F).sql'   # 生产机无 mysql 客户端时，
                                                                                    # 改从测试机用 .rds.cnf 导出

# 1) 逐脚本执行（脚本在 sql/prod/，均幂等）
for f in $(ls sql/prod/2026-*.sql | sort); do
  echo "== $f"; mysql tou_mall_current < "$f" || break
done

# 2) 校验结构：必须输出 ✅
./scripts/sql-audit.py --host mall-test --db tou_mall_current \
  "--mysql-opts=--defaults-extra-file=/opt/fullyu-mall-test/.rds.cnf"

# 3) 换 jar（发版流程，另行执行）
```

> 生产机没有 `mysql` 客户端（只有 jar），所以第 1 步实际是在**能连 RDS 的测试机**上执行：
> `ssh mall-test 'mysql --defaults-extra-file=/opt/fullyu-mall-test/.rds.cnf tou_mall_current' < sql/prod/xxx.sql`

## 五、这批脚本会写数据的部分（执行前过一眼）

| 脚本 | 写什么 |
|---|---|
| `2026-10-21-incentive-v5.sql` | 激励参数/档位的默认种子（仅当系统无生效参数时写入） |
| `2026-11-07-member-card*.sql` | 会员卡表结构与配置；少量 UPDATE 回填 |
| `2026-11-07-reception-cap.sql` | 门店 `reception_cap_percent` 初始化为 20 |
| `2026-11-08-prepaid-member-reward.sql` | 预付费会员奖励任务表 + 一条初始化 |
| `2026-11-09~11-11 admin-menu*.sql`、`customer-tag-menu.sql`、`remove-member-card-*` | 后台菜单/页签/权限行（**会改变生产后台导航**） |

**未纳入本轮**：`2026-11-26-member-card-advance-only.sql`（未来版本，且会把
`s_member_card_config.same_day_rate` 固定为 1.0，属业务口径变更，需单独确认）。

## 六、回滚

DDL 全部是"加列/加表/加菜单行"，回滚 = 换回旧 jar（旧代码不读这些列，留着无害）。
真要清：

```sql
ALTER TABLE `c_customer` DROP COLUMN `birthday`;
ALTER TABLE `n_admin_approval_notice` DROP COLUMN `last_result`;
ALTER TABLE `n_admin_approval_notice_attempt` DROP COLUMN `result`;
-- 其余按 sql/prod/ 里脚本的 CREATE TABLE 反查后 DROP
```

## 七、发版日 checklist

顺序不可颠倒：**结构 → 校验 → 换 jar → 数据迁移 → 冒烟**。

- [ ] 1. RDS 控制台打一次快照（或测试机 `mysqldump tou_mall_current` 全量导出）
- [ ] 2. 按文件名顺序执行 `sql/prod/*.sql`（26 个，均幂等，可重跑）
- [ ] 3. `./scripts/sql-audit.py --host mall-test --db tou_mall_current "--mysql-opts=--defaults-extra-file=/opt/fullyu-mall-test/.rds.cnf"` → 必须 **✅**
- [ ] 4. 换 jar（后端）+ 发布管理端前端（`/server/www/fully/dist/`，与菜单脚本同一批）
- [ ] 5. **换 jar 之后**执行客户昵称迁移（见 §九；必须放在新 jar 之后，否则中间新建的客户又变回「用户+手机号」）
- [ ] 6. 冒烟：后台能登录且左侧导航正常 → 建单（搜手机号）→ 首页今日服务安排 → 会员卡列表 → 审批待办 → 定时任务日志无 `Unknown column`
- [ ] 7. 各角色抽一个账号登录，确认 5~12 的可见菜单符合预期
- [ ] 8. 收尾：删除测试机影子库 `tou_mall_prodcopy`，关闭任务 #11

**不进本轮**：`2026-11-26-member-card-advance-only.sql`（未来版本，且会把
`s_member_card_config.same_day_rate` 固定为 1.0，属业务口径变更，需单独确认后再上）。

## 八、相关工具

| 工具 | 用途 |
|---|---|
| `scripts/sql-audit.py` | `sql/` 与库结构对账，缺表/缺列退出码 1；`--mysql-opts` 可读 RDS |
| `scripts/make-prod-sql.py` | 从 `sql/` 生成 `sql/prod/`（只改守卫，`--check` 查同步） |
| `scripts/deploy-test.sh` | 测试环境发布，已内置 SQL 预检（缺列直接中止） |

## 九、客户昵称去手机号化（数据迁移，非 DDL）

背景：历史客户默认昵称是「用户+手机号」，客户列表/订单/排班/导出都能看到号码，
等于变相保留手机号。新代码（`NicknameGenerator`）改为「中文词+4位数字」（如 `青竹4821`），
历史数据用 `sql/prod/2026-11-12-customer-nickname-anonymize.sql` 一次性清洗。

| 项 | 说明 |
|---|---|
| 影响范围 | 只改 `c_customer.nickname`，不删不改手机号本身；手机号仍用于登录/检索 |
| 匹配规则 | `nickname = CONCAT('用户', phone)`，或 `nickname` 形如 `用户[+]?数字`（历史截断/带区号的脏数据） |
| 保留范围 | 客户自己改过的昵称（如 `Dora`、`小殊-测试账号`）**一条不动** |
| 生成规则 | 按 `id` 取 MD5 两段哈希（词/数字互不相关），确定性生成；重复执行结果一致，幂等 |
| 留痕 | 脚本建 `c_customer_nickname_bak_20261112`（id + 原昵称），回滚用 |
| 测试环境 | 2026-11-12 已在 `tou_mall_test` 执行：9978 位客户，改写 9922 条，剩余默认样式 **0**，去重后 9881 个不同昵称 |
| 排序注意 | 必须在新 jar 生效后执行；若在换 jar 前执行，换 jar 后再补跑一遍即可 |

生产执行：

```bash
ssh mall-test 'mysql --defaults-extra-file=/opt/fullyu-mall-test/.rds.cnf tou_mall_current' \
  < sql/prod/2026-11-12-customer-nickname-anonymize.sql
```

脚本末尾自带自检 SQL，`still_default_nickname` 必须为 `0`。

回滚（仅回滚本次改写的行）：

```sql
UPDATE `c_customer` c
  JOIN `c_customer_nickname_bak_20261112` b ON b.`id` = c.`id`
  SET c.`nickname` = b.`nickname`;
```

## 十、2026-11-13 追加：`s_order.visit_no`（到店次数静态编号）

| 项 | 说明 |
|---|---|
| 脚本 | `sql/prod/2026-11-30-order-visit-no.sql`（幂等，已由 `make-prod-sql.py` 生成） |
| 内容 | 仅 `ALTER TABLE s_order ADD COLUMN visit_no INT NULL`，无回填、无默认值、无 DROP/MODIFY |
| 旧 jar 兼容 | 是。09-12 的代码按实体列名显式查询，多一列 NULL 无影响，可先于换 jar 执行 |
| 新代码行为 | 建单时按「同客户同自然日只算一次」写入序号；同一天第二单沿用当天序号；历史单 NULL，展示与折扣回退到原统计口径 |
| 测试环境 | 2026-11-13 已执行并发布（jar 18:05 构建，健康检查 200） |
| 冒烟 | 测试环境下一单后执行：`SELECT id, customer_id, visit_no FROM s_order ORDER BY id DESC LIMIT 3;` 新单 `visit_no` 应为 1 或「当天已有序号」 |

## 十一、2026-11-13 追加：`s_order.visit_no` 历史数据回填（**上线最后一步**）

| 项 | 说明 |
|---|---|
| 脚本 | `sql/prod/2026-12-01-order-visit-no-backfill.sql`（幂等，已由 `make-prod-sql.py` 生成） |
| 执行时机 | **必须放在整次发版的最后**：加列脚本已执行 → 新 jar 已生效 → 再跑本脚本 |
| 口径 | 与 `OrderService#isVisitCounted / planVisitNo` 一致：服务日 = 明细里最早 `start_time` 的日期；同客户同一天多单共用一个序号；序号 = 按服务日升序的 `DENSE_RANK`；产品单(type=0) 且 state∈(0,1,2) 且 appointment_state∈(0,1,2) 才占号 |
| 置空 | 取消(4)/超时(3)/退款中(5)/已退款(6)/审批退款中(7)、预约已取消、非产品单：`visit_no` 置 NULL |
| 留底 | 首次执行建 `s_order_visit_no_bak_20261201`（id/customer_id/原 visit_no），重复执行不覆盖 |
| 影响面 | 只改 `s_order.visit_no`，不动金额/状态/明细；历史折扣已落库，回填不会退钱也不会补差价 |
| 幂等 | 连跑两遍结果一致；`NOT (visit_no <=> rn)` 保证只写变化的行 |
| 生产库版本 | RDS MySQL 8.0.36，支持窗口函数；`s_order` 约 4.2 万行，单次 UPDATE 秒级 |
| 测试环境 | 2026-11-13 20:21 已在 `tou_mall_test` 执行：占号单 19,329 条全部有编号、7,867 位客户、最大第 208 次；三个自检项 0/0/0；连跑两遍结果一致（幂等）；回填前 `s_order` 已备份 `backup/db/s_order-20261113-2021.sql.gz`（1.4 MB） |

生产执行与自检：

```bash
ssh mall-test 'mysql --defaults-extra-file=/opt/fullyu-mall-test/.rds.cnf tou_mall_current' \
  < sql/prod/2026-12-01-order-visit-no-backfill.sql
```

脚本末尾三个自检项（`counted_without_visit_no` / `customer_day_conflict` / `uncounted_with_visit_no`）
必须全为 `0`；最后一行是最近 10 个产品单的编号抽样。

回滚（仅当需要把编号退回回填前状态，展示会回落到实时统计口径）：

```sql
UPDATE `s_order` o
  JOIN `s_order_visit_no_bak_20261201` b ON b.`id` = o.`id`
  SET o.`visit_no` = b.`visit_no`;
```

回滚后按需 `DROP TABLE s_order_visit_no_bak_20261201;`（建议留到观察期结束）。

## 十二、2026-11-13：36 个生产脚本"三遍幂等"验证（P0-4）

**方法**：用当天生产快照还原到测试机 `idem_check_20261113`（123 表），按文件名顺序把
`sql/prod/*.sql`（**37 个**）连跑三遍；每遍结束对全部表逐表 `count(*)` 比对，同时记录退出码与输出。

**结果（修完后）**
- 三遍均 **0 失败**
- pass1 = pass2 = pass3 **逐表行数完全相同**（163 表 / 417,016 行）
- 结构：123 表 → **163 表 / 1640 列**
- `visit_no` 自检三项均为 **0**；`s_order_visit_no_bak_20261201` 为 **0 行**（生产无历史编号，符合预期）

**修掉 3 个"退出码 0 但不幂等"的坑**（都出在备份逻辑上，只看退出码发现不了）

| # | 脚本 | 症状 | 根因 | 改法 |
|---|---|---|---|---|
| 1 | `2026-11-10-admin-menu-ia.sql` | `ums_role_menu_relation_bak_20261110` 每轮 **+131 行** | 备份写 `WHERE NOT EXISTS (b.id = r.id)`，但该表每轮 `DELETE+INSERT` 后 id 自增，等于每轮都是"新行" | 改成"备份表为空时才取一次"（`SET @bak_empty_…`） |
| 2 | `2026-11-11-admin-menu-tabs.sql` | `…_bak_20261111` 每轮 **+148 行** | 同上 | 同上 |
| 3 | `2026-12-01-order-visit-no-backfill.sql` | 备份表第一遍 **0 行**、第二遍突然 **19,439 行** | 用"备份表行数=0"判首次；而生产首次快照天然是空集 → 第二遍把**回填后**的值当"原值"存下来，回滚依据直接是错的 | 改用哨兵表 `s_order_visit_no_bak_20261201_done` 判首次 + `INSERT IGNORE` |

（`ums_menu_bak_20261110` 也在第 2 类里，第二轮 +29 行，一并按"只取一次"修掉。）

**教训**：SQL 脚本的幂等性不能只看退出码，必须比对"每遍之后的全库行数"。这类 bug 在生产上不报错，
只会把备份表悄悄喂大、甚至喂成错的回滚依据。


**追加（同日 23:40）**：仓库在验证期间新增了 `2026-11-13-shop-i18n.sql`（`s_shop` 加三个英文列，
information_schema 判存量，天然幂等）。扩到 **37 个**脚本重跑三遍：0 失败、pass1=pass2=pass3、
163 表 / 417,016 行、`s_shop` 三个英文列就位。**今后脚本数一变（≠37），必须重新做这次验证**——
`scripts/preflight.sh` 已把这条做成硬检查。

**边界**：本次验证的是"在**当前生产结构**上重复执行"这一真实发版场景；空库从零建库的顺序正确性，
仍以 §二 的影子库演练为准。

## 十三、2026-11-15 Night 1 已执行：33 个脚本上生产（只 DDL，不换 jar、不动前端）

分两夜走的**第一夜**，按「一个窗口只改一个变量」执行：只改库结构，代码/前端零改动。

### 执行前

| 项 | 值 |
|---|---|
| 生产快照 | `121.40:/opt/fullyu-mall-backups/db/tou_mall_current-20261115T143237Z.sql.gz`（10,948,024 B，sha256 `424b346f…f521b9b`，123 表，binlog `mysql-bin.002179:3052632`） |
| 演练库 | `121.40:n1rehearse_20261115`（快照还原后按序跑三遍） |
| 三遍结果 | pass1=pass2=pass3，0 失败，逐表行数完全相同；123 表 → 157 表 |
| 结构对账 | `sql-audit.py` → ✅ 表/列一致（157 表 / 1635 列，与生产执行后完全一致） |
| 高危语句 | 0 个 `DROP`/`TRUNCATE`/`RENAME`/`MODIFY`/`CHANGE`/`DELETE`；73 处 `ADD COLUMN` 全部可空或带默认值 |

**执行前必须先补 `sql/prod`**：`make-prod-sql.py --check` 报落后两个脚本（`2026-12-01-pay-group.sql`、
`2026-12-03-member-card-rate-realtime.sql`）。已跑 `make-prod-sql.py` 生成，`sql/prod` 现 **40 个**（基线 37 → 40，
故重做了上面的三遍验证）。

### 执行结果（生产 `tou_mall_current`）

| 项 | 执行前 | 执行后 |
|---|---|---|
| 表 | 123 | **157** |
| 列 | — | **1635** |
| `s_order` 行 | 46,322 | 46,322（未变） |
| `c_customer` 行 | 10,083 | 10,083（未变） |
| `ums_menu` 行 | 44 | 51（新增行，无删除） |
| `ums_role_menu_relation` 行 | 136 | 166（新增行，无删除） |

执行日志：`121.40:/opt/fullyu-mall-backups/db/night1-20261115-223905/run.log`（逐个脚本 OK，fails=0）。
`pay-group` 单独跑两遍（幂等），建 `s_pay_group` 23 列。

冒烟：`/health` 200、`cityretreat` 200、`/api/product/list` 200、当日日志 `ERROR` 计数 0。旧 jar 未重启。

### 留到 Night 2 的 7 个脚本（务必与新 jar + 新前端同一窗口）

| 脚本 | 为什么不能提前 |
|---|---|
| `2026-11-10-admin-menu-ia.sql` | **删 51 行菜单、只留 22 行新 IA**，`ums_role_menu_relation` 166→101。09-12 的前端把菜单写死、只靠 DB 驱动权限，提前跑会让现网后台权限对不上 |
| `2026-11-09-remove-member-card-integration-menu.sql`、`2026-11-11-admin-menu-tabs.sql`、`2026-11-11-customer-tag-menu.sql` | 同上，页签/菜单行随新前端一起生效 |
| `2026-11-12-customer-nickname-anonymize.sql` | 必须在新 jar 之后（否则中间新建客户又落回「用户+手机号」） |
| `2026-12-01-order-visit-no-backfill.sql` | 整次发版最后一步（新 jar 生效后回填历史编号） |
| `2026-12-03-member-card-rate-realtime.sql` | 条款文案随新「实时口径」一起上，单独跑会造成文案与行为不一致 |

这 7 个已在 `n1rehearse_20261115`（= 生产 Night 1 之后的状态）**各跑两遍**：0 失败、逐表行数两遍相同、
`s_order` 里 `counted_without_visit_no=0`。结果 157 表 → 164 表 / 419,582 行。

### Night 1 踩到的两个坑（下一位注意）

1. **脚本顺序不能用 macOS 的 `sort` 生成**。`2026-11-07-member-card-v2.sql` 依赖
   `2026-11-07-member-card.sql` 建的 `s_member_card_config`；BSD `sort` 按标点优先把 `-v2` 排在前面 →
   `Table doesn't exist`。GNU `sort`（服务器 `en_US.UTF-8`）顺序正确。**顺序一律在服务器上生成**：
   `ls sql/prod/2026-*.sql | sort`，别在 Mac 上排好了再传。
2. **排序规则漂移仍在**：`s_integration_operation` / `s_stat_internal_account` 的 `phone` 是
   `utf8mb4_0900_ai_ci`，而 `oms_company_address` / `ums_member` 是 `utf8mb3_general_ci`。
   `sql-audit` 只告警（默认不失败）。新代码里若出现 `ia.phone = ums_member.phone` 这类比较会抛 1267，
   Night 2 上线前要确认相关 SQL 已显式 `CONVERT(... USING utf8mb4) COLLATE ...`。

### 回滚

库层面：加列/加表/加行对 09-12 的旧 jar 全透明，**不回滚也安全**。真要回到执行前：
还原上面那份快照（123 表），或只删 `s_pay_group` 与本次新增列（清单见 `run.log`）。
