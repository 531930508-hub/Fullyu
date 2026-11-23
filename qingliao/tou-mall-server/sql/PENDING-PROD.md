# 生产待执行 DDL（发版前必须做完）

> 2026-11-11 建立。触发原因：测试环境上线了带 `Customer.birthday` 的代码，但库没加列 →
> MyBatis-Plus 把 `birthday` 拼进每一条客户查询 → 全站 `Unknown column`。测试库已补。
>
> **2026-11-11 核验后更正**：原来记的"生产缺 3 个列"是低估。生产机的 jar 是
> **09-12 构建**（进程 2026-10-15 02:02 起），代码落后约两个月，
> 生产库 `tou_mall_current` 相对 `sql/` 缺 **92 个对象（19 个脚本）**。

## 一、生产现状（2026-11-11 建立；**2026-11-18 更新主机事实**）

> 11-17 生产轻疗已从 8.133 迁到 120.55（见 `docs/deploy/domains.tsv` 与
> `docs/deploy/生产方案-最终版.md` §9.8）。下表「主机/运行」两行已按新机器改写；
> 「jar 构建时间」与「差距」两项 11-18 复核仍然成立（jar 仍是 09-12、库仍是 123 表）。

| 项 | 值 |
|---|---|
| 主机 | **120.55.36.3**（原 8.133.6.18，11-17 00:22 迁入）；进程在 `/server/java/fully/`，启动/停止脚本 `start-120.sh` / `stop-120.sh` |
| 运行 | `java -Dspring.profiles.active=prod -jar mall-admin-1.0-SNAPSHOT.jar --spring.redis.password=…`（**无 systemd，PPID=1**；Redis 密码走命令行，jar 内该值为空） |
| jar 构建时间 | `mall-admin-1.0-SNAPSHOT.jar` = **09-12 01:30**（11-18 实测未变） |
| 数据库 | 阿里云 RDS `tou_mall_current`：**123 张表**（11-18 实测未变）、9977 位客户 |
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
./scripts/sql-audit.py --host test-cityretreat --db tou_mall_current \
  "--mysql-opts=--defaults-extra-file=/opt/fullyu-mall-test/.rds.cnf"

# 3) 换 jar（发版流程，另行执行）
```

> 生产机没有 `mysql` 客户端（只有 jar），所以第 1 步实际是在**能连 RDS 的测试机**上执行：
> `ssh test-cityretreat 'mysql --defaults-extra-file=/opt/fullyu-mall-test/.rds.cnf tou_mall_current' < sql/prod/xxx.sql`

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
- [ ] 3. `./scripts/sql-audit.py --host test-cityretreat --db tou_mall_current "--mysql-opts=--defaults-extra-file=/opt/fullyu-mall-test/.rds.cnf"` → 必须 **✅**
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

> **2026-11-21 已回退**：默认昵称改回「用户+手机号后四位」，见第十五节。本节仅作历史记录保留。

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
| **生产执行** | **2026-11-19 03:14 已在 `tou_mall_current` 执行**：10146 位客户，改写 **10090** 条，`still_default_nickname=0`；备份表 10090 行；56 条客户自改名前后 MD5 一致未动；去重后 10046 个昵称。其中 13 条为 `用户`+短/脏 phone 的测试脏数据（phone 如 `朱`、`11`），按精确匹配规则一并改写，可用备份表逐条恢复 |
| 排序注意 | 必须在新 jar 生效后执行；若在换 jar 前执行，换 jar 后再补跑一遍即可 |

生产执行：

```bash
ssh test-cityretreat 'mysql --defaults-extra-file=/opt/fullyu-mall-test/.rds.cnf tou_mall_current' \
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
ssh test-cityretreat 'mysql --defaults-extra-file=/opt/fullyu-mall-test/.rds.cnf tou_mall_current' \
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

## 十四、2026-11-15 Night 2 已执行：剩余 7 个脚本 + 换 jar + 换前端（发布完成）

### 发了什么

| 项 | 值 |
|---|---|
| 新 jar | `sha256=5252c3f165939ec9ffc7f0c6513cd3af8d01b659e02a488f59dedd5d462e970b`，311,611,592 B，构建于 `121.40:/opt/fullyu-mall-test/src/tou-mall-server`（与仓库 2b419cf 源码逐文件校验一致，仅仓库多 `Env.java`、`OssServiceImplTest.java` 两个未参与编译的差异） |
| 生产配置 | jar 内 `application-prod.yml` 与旧 jar 逐行 diff：**只多不少**，新增项全部默认关闭（`crm.enabled`/`brand-crm.enabled` 空、`shop.scope.enforce=false`、`incentive.team-cert-enabled=false`），DB 仍指 `tou_mall_current` |
| SQL | 剩余 7 个（菜单 IA、标签/页签菜单、昵称清洗、`visit_no` 回填、卡条款文案），跑完 164 表 / 1665 列 |
| 前端 | `121.40:/opt/fullyu-mall-test/admin-dist`（171 文件 / 23 MB / 11-15 06:17 构建）→ `/server/www/fully/dist`，旧版备份在 `dist.bak-night2-20261115-230341`（380 文件 / 69 MB） |
| 回滚包 | `/server/java/fully/backup/20261115-231500-release-night2/`（含 jar + MANIFEST + ROLLBACK.md），`preflight.sh` 的 `RB_PKG`/`RB_SHA_EXPECT` 已改指这里，脚本数基线 37 → 40 |

### 发布后实测

- `ums_menu` 51 → **22**、`ums_role_menu_relation` 166 → **101**（新 IA）
- `visit_no` 空值行 = **0**；昵称仍是「用户+手机号」样式的行 = **0**（昵称脚本重复跑两次，幂等）
- `sql-audit` → ✅ 表/列一致（164 表 / 1665 列）
- 冒烟：`/health` 200、`cityretreat` 200、`/api/product/list` 200、`manage.fullytherapy.com` 200；新接口 `/api/memberCard/config`、`/api/ums/menu/list`、`/api/brandMember/products` 全部 200；新 jar 当日日志 `ERROR=0 WARN=0`；前端 `static/js/*.js` 资源 200

### 一键回滚（已实测，不是纸面方案）

分两段跑（121.40 到生产没有免密，实测 `Permission denied`，所以代码侧必须在 Mac 上跑）：

```
# 1) 库（在 121.40 上，有 RDS 凭据）
ssh test-cityretreat /root/bin/night2-rollback.sh db

# 2) 代码（在 Mac 的仓库里）
./scripts/rollback-prod-code.sh --jar-dir 20261115-230731 \
        --restore-dist dist.bak-night2-20261115-230341
```

| 入口 | 做什么 |
|---|---|
| `night2-rollback.sh db` | 按 bak 还原昵称 → 还原 `visit_no` → 整表还原 `ums_menu`/`ums_role_menu_relation` → 删掉今晚新增的 41 张表、54 处列与索引 |
| `night2-rollback.sh check` | 只体检不改（对比参考库 `base2215` 的表/列/索引清单与关键行数）；刚发完版跑它必然是 FAIL，回滚后应为 PASS |
| `night2-rollback.sh all` | 库 + 尝试换 jar；联不通生产会明确 `exit 3` 并给出上面两条命令，不会假装成功 |
| `scripts/rollback-prod-code.sh` | 换回上一版 jar 重启（180s 健康检查，起不来自动再换回当前线上）+ 可选还原 dist + 冒烟 |

**实测证据**：在 `n1rehearse_20261115` 上（从 22:33 快照还原 → 跑完 40 个脚本 = 生产发布后状态）执行 `db` 模式，
体检结果 **表 123 表一致 / 列 1209 一致 / 索引 131 一致 / ums_menu=44 / rel=136 / 默认昵称数 10027 / visit_no 非空=0 → DB_ROLLBACK=PASS**。
即：能真的回到「今晚执行前」，而不只是「加列无害、将就用」。

参考库 `base2215`（22:33 快照还原，只读）**不要删**，回滚脚本依赖它。

### 踩到的三个坑

1. **`deploy-prod.sh` 有 bug**：`JAVA_CMD='java -Xms2048m …'` 通过 `VAR=… bash -s` 传给远端时没加引号，
   远端把 `-Xms2048m` 当命令执行 → `exit 127`。**好在那一步在 `stop_app` 之前就失败了，生产没被动过**
   （已确认进程仍是旧 jar、health 200）。本次改用 `/tmp/swap_jar.sh` 手工换（同样带 180s 健康检查 + 自动回滚）。
   **下次发版前先修这个脚本**，否则每个窗口都会撞。
2. **前端 dist 体积 69 MB → 23 MB**：生产旧 dist 是 380 文件（跨多次发布累积），新 dist 171 文件，`rsync --delete` 后旧 chunk 被清掉。
   已整目录备份，若要回滚用 `mv dist.bak-night2-20261115-230341 dist`。
3. **排序规则漂移多了一处**：`c_customer_nickname_bak_20261112.nickname`（utf8mb4_0900_ai_ci）。
   这个表是清洗脚本的备份表，回滚时会删掉，不影响业务；`phone` 那处仍待 DBA 决定。

### 明早要看的三件事

1. 后台各角色（店长/前台/理疗师/财务）登录后菜单是否与预期一致 —— 菜单 IA 是这次唯一"减法"，出问题最可能在这里
2. 小程序下单、会员卡、`visit_no` 编号是否正常（`s_order.visit_no` 已全量回填，新单由新 jar 生成）
3. 新 jar 日志 `ERROR` 计数；CRM/品牌卡相关功能默认关闭，未配环境变量前不应有相关报错

## 十五、2026-11-21：客户默认昵称改回「用户+手机号后四位」

**这是第九节的回退**，业务侧的取舍（店员要靠后四位认人）；第九节里「昵称不拼手机号」的结论作废，
但那次的清洗脚本与备份表保留，不回退历史执行记录。

**改了什么**

| 位置 | 改动 |
|---|---|
| 代码 | `NicknameGenerator.defaultNickname(phone)` = `用户` + 手机号后四位；取不到后四位（脏号）退回随机词 |
| 代码 | `CustomerService.initCustomer` 改调 `defaultNickname(phone)` |
| 数据 | `sql/2026-11-21-customer-nickname-phone-tail.sql`（轻疗 `c_customer`） |
| 数据 | `crm/apps/server/prisma/nickname-phone-tail-20261121.sql`（CRM `members.name`） |
| 代码 | `presence`：`apps/server/src/common/nickname.ts` 新增 `defaultNickname(phone)`，微信登录/devLogin 建号改用它（导师建号兜底仍用随机词） |
| 数据 | `presence/apps/server/prisma/nickname-phone-tail.sql`（在场 `users`） |
| 前端 | 脱敏逻辑无需改（只在昵称等于「用户+完整手机号」时才遮）；客户列表头像占位字改为取号码后两位（`用户7229` → `29`），否则一万多位客户的头像都是同一个「用」 |

**为什么必须两边一起改**：CRM 是会员资料主档，轻疗每次登录只要 CRM 的 `profile_version >=` 本地就整包覆盖昵称
（`BrandMemberProfileSync.refreshQuietly`）。只改轻疗，客户一登录就被改回随机词；只改 CRM，后台要等客户登录后才变。

**数据实测（生产库只读核对，2026-11-20）**

| 项 | 轻疗 `c_customer` | CRM `members` | 在场 `users` |
|---|---|---|---|
| 总数 | 10,184 | 10,153 | 10 |
| 随机样式（两位中文+四位数字） | 10,128 | 10,096 | 5 |
| 客户自取昵称（保留不动） | 56 | 57 | 3 |
| 脏手机号（保留原昵称） | 13 | 11 | 0 |
| 已是「用户XXXX」（不动） | 0 | 1 | 2 |

**重名是已知代价**（业务已确认接受）：后四位只有 1 万种，迁移后 **2,665 组重名**，
「用户1888」「用户6666」「用户7777」各 10 人。昵称不作为唯一标识，检索仍以手机号为准。

**执行顺序（同一窗口内完成）**

```bash
# 1) 先 CRM（生产 crm 库与轻疗同实例；库名按环境：生产 crm、测试机本地库 crm_test）
scp crm/apps/server/prisma/nickname-phone-tail-20261121.sql root@120.55.36.3:/tmp/
ssh root@120.55.36.3 \
  'mysql --defaults-extra-file=/etc/fullyu/qingliao-backup.cnf crm < /tmp/nickname-phone-tail-20261121.sql'

# 2) 再轻疗
ssh test-cityretreat 'mysql --defaults-extra-file=/opt/fullyu-mall-test/.rds.cnf tou_mall_current' \
  < sql/prod/2026-11-21-customer-nickname-phone-tail.sql

# 3) 在场（同实例 fullyu 库）
scp presence/apps/server/prisma/nickname-phone-tail.sql root@120.55.36.3:/tmp/
ssh root@120.55.36.3 \
  'mysql --defaults-extra-file=/etc/fullyu/qingliao-backup.cnf fullyu < /tmp/nickname-phone-tail.sql'

# 4) 发版：新 jar（轻疗）+ 新 presence 构建 + 新前端（头像占位字）
```

在场与 CRM 之间没有昵称回写：它在场本地昵称只在客户自己改资料时推给 CRM，登录不会从 CRM 覆盖，所以这一步顺序不敏感。

第 1 条用的是轻疗的 `fully` 账号（同一 RDS 上对 `crm` 库有写权限，已核对）；用 CRM 自己的库账号执行同样可以。

**自检期望值**：轻疗 `still_random` = 13、`custom_kept` = 56（+ `user_tail` 10,115）；
CRM `still_random` = 11、`custom_kept` = 57；在场 `still_random` = 0、`user_tail` = 7、`custom_kept` = 3。
三份脚本都可重跑（改完的昵称是 `用户XXXX`，被 `NOT LIKE '用户%'` 排除）。

**已验证**：在测试 RDS 上用生产数据副本（`nick_rehearse_mall` / `nick_rehearse_crm` / `nick_rehearse_presence`）各跑两遍，
结果与上面一致、二次执行零变化；`NicknameGeneratorTest` 7 项、在场 `test/nickname.spec.ts` 5 项全绿，
在场 `tsc --noEmit` 通过。临时库与临时工程已删除。

**已知边界**

1. 13 位脏手机号（`7702`、`0000`、`朱` 等）保留原随机昵称，不生成「用户朱」「用户0000」这种名字。
2. 两端昵称不一致的 2 位：一位是 CRM 手机号干净、一位是 CRM 里客户自取过名字（`有光`）。
   客户下次登录时以 CRM 为准自动对齐，不需要额外处理。
3. 直接 SQL 改 CRM `name` 不会写 `audit_logs`；需要留痕的话补一条后台操作记录即可。
4. 在场昵称会出现在社区帖子里（其他会员可见），后四位外露是业务这次明确接受的取舍；
   在场导师建号（`trainer.service.ts`）的兜底昵称仍是随机词——那是员工展示名，不走客户口径。

**回滚**：三份脚本末尾都有按备份表还原的注释 SQL（`c_customer_nickname_bak_20261121`、
`member_name_bak_20261121`、`users_nickname_bak_20261121`），CRM 侧连 `profile_version` 一起还原，避免两端版本号打架。

## 十六、2026-12-05：疗愈师英文名（新增列）

**改了什么**

| 位置 | 改动 |
|---|---|
| 数据 | `sql/2026-12-05-massagist-english-name.sql` → `s_massagist.english_name varchar(64) NULL` |
| 代码 | `Massagist.englishName`（`updateStrategy = ALWAYS`，清空时写 `NULL`，否则 MyBatis-Plus 默认忽略 null 改不掉） |
| 前端 | 疗愈师管理列表加「英文名」列；新增/编辑弹窗「疗愈师姓名」下方加选填「英文名」 |

**性质**：纯加列（`DEFAULT NULL`），旧 jar 实体不含该列，INSERT/UPDATE 显式列名，对现网零影响。
守卫按 `information_schema.COLUMNS` 判存量，可重复执行；`sql/prod/` 已由 `scripts/make-prod-sql.py` 生成，
契约测试 `MassagistEnglishNameContractTest` 覆盖「守卫 / 列定义 / 生产版无条件执行 / 实体字段」。

**口径**

1. 选填，只做展示与导出（排班看板、考核记录、培训考核导出的「中文名 英文名」写法），不参与任何匹配。
2. 不改 `ums_admin.nick_name`：后台登录名、审批通知、申请人展示仍走中文名（见 `AdminNoticeDisplayName.SQL_APPLICANT`）。
3. 列表搜索仍只按中文名 `like`；英文名不建索引。
4. 存量英文名（如 阿舍 Asher）目前在历史考核表里，需要业务确认后再决定是否回填，本轮只加列不写数据。

**回滚**：`ALTER TABLE s_massagist DROP COLUMN english_name`（旧代码不读该列，可留可删）。

## 十七、2026-11-21 00:0x：第 15 节上线执行记录

**发版内容**：`main` = `90cca17`（比原计划多出 CRM 占位名/姓名规则、品牌卡开售开关、
打印与百度语音密钥迁环境变量、时叙杯贴规格行/热饮冰量、飞鹅通道删除）。

| 步骤 | 命令/产物 | 实测结果 |
|---|---|---|
| ① CRM 昵称 | `crm/apps/server/prisma/nickname-phone-tail-20261121.sql` | `still_random=11 custom_kept=57 user_tail=10106` |
| ② 轻疗昵称 | `sql/prod/2026-11-21-customer-nickname-phone-tail.sql`（测试机 `.rds.cnf` 连生产） | `still_random=13 user_tail=10115 custom_kept=56` |
| ③ 在场昵称 | `presence/apps/server/prisma/nickname-phone-tail.sql` | `still_random=0 user_tail=8 custom_kept=3` |
| ④ 生产 env 补键 | `/etc/fullyu/qingliao.env` 追加 `BAIDU_VOICE_*`（旧值取自 `application-prod.yml`）；备份 `.bak-baidu-<TS>` | `check-env-keys.sh` 29 键 `ok` |
| ⑤ 换 jar | `scripts/deploy-prod.sh`（自动快照 + env 门禁 + preflight + 冒烟 + 失败回滚） | 新 jar `sha256=4a20a57c…85813`，`Started MallAdminApplication in 96s`，4 项冒烟全 PASS |
| ⑥ 管理端 dist | `/server/www/fully/dist`（`59a51eb` 构建，13 项闸门通过） | `index.html` 已切，`build-info.json`：`entry=app.1c5433…`、`markers=13`；回滚包 `dist.bak-20261120-233510` |
| ⑦ 在场服务 | 生产 `/root/fullyu/apps/server/dist` 23:04 已含 `DEFAULT_NICKNAME_PREFIX='用户'` | 无需重复发布 |

**遗留**

1. 小程序没出包：`qingliao/apps/miniprogram` 本地 `node_modules` 缺 `uni` 可执行，需按原流程 `npm ci` 后在微信开发者工具上传。
2. CRM 服务本次未重新发布（CRM 侧代码已在 `main`，占位名规则要生效需单独发 CRM）。
3. `DouGongPayClient` 退款签名改用 `PAY_SIGN_SECRET`。**更正（11-21 复核）**：豆工客户端就是线上的汇付通道封装（`BasePayClient` + `huifu_id`），不是「未启用」；但该签名只拼进 `baseNotifyUrl`，而 `dataMap.put("notify_url", …)` 与 `DyPayController` 的 `refund/notify` 处理器都在初始导入时就是注释状态，`validateRefundSign` 无调用方，线上无可执行路径。支付回调验签走 `DgPaySignUtils.verifySign(msgBody, PayCert.signSecret, sign)`，本次未改动。若将来恢复退款回调，需给签名单独配一个密钥变量。
4. 回滚：jar 用 `scripts/rollback-prod-code.sh`（本次旧包 `97c572e1…` 在 `/server/java/fully/backup/20261120-233144/`），
   前端 `mv dist dist.discard-<TS> && mv dist.bak-20261120-233510 dist`，昵称按三份 SQL 末尾注释还原。

**顺带修掉的坑**：`maven.compiler.release=8` 在 JDK 8 上编不过（`invalid flag: --release`），已改成 `<jdk>[9,)</jdk>` 激活的 profile；
cherry-pick 把 yml/pom 的 CRLF 改成 LF，已还原，避免整文件重写噪声。

### 十七补记（2026-11-21 00:2x）

- **CRM 生产已发**（`crm.fullyu.cn` / 121.40.119.57 `/opt/fullyu-crm`，unit `fullyu-crm`）：源码取 `main@90cca17`，
  备份 `/root/backups/crm-all-20261120-234*`，`pnpm install --frozen-lockfile` + `schema:mysql` + `prisma generate` + `tsc` 重建 dist，
  重启后 `/api/health` 200、`/admin/` 200、`/` 302、`/api/sync/status` 401；`dist/common/member-name.js` 含占位名新逻辑。
  无 schema 变更，未跑 `db:push`。
- **`9e1f9d9` 已补发（11-21 00:56，`main@7096b0d`）**：先给生产 `crm`、测试 `crm_test` 两个库加 `member_identities.created_at`（DATETIME(3)，存量回填 `members.created_at`，生产 10,185 行），再两端重建 CRM；探针验证控制字符被剥离、`GET /api/external/members/:id` 返回 `boundAt`。详见 `crm/README.md` 同名发布记录。
- **生产/测试 env 去重**：`BAIDU_VOICE_*` 出现过空值与实值各一份，已按「后者生效」删掉前面的空行（`/etc/fullyu/qingliao.env`、`/opt/fullyu-mall-test/.env`），
  测试机同时补齐 `PRINT_*`/`BAIDU_VOICE_*`（下次发测试后端才不会静默丢打印配置）。
- **轻疗小程序**：`main` 含 `4afccb8` 的下单页改动，已用 devtools CLI 覆盖上传开发版 `1.0.22`（1.1 MB，AppID `wxeb4e8a99b7eeebf8`）。
- **豆工/汇付核对**：生产 66 单 `pay_type` 只有 0/1/2；退款走 `BasePayClient` 请求体，不含本次改动的签名串。

## 十八、2026-12-08：轮牌拆成两套队列（服务单 / 接待单）

**改了什么**

| 位置 | 改动 |
|---|---|
| 数据 | `sql/2026-12-08-reception-queue-two-kind.sql` → `s_reception_queue` 加 `queue_kind tinyint NOT NULL DEFAULT 0`、`duty_time datetime NULL`；唯一键 `uk_date_shop_massagist` → `uk_date_shop_kind_massagist(queue_date, shop_id, queue_kind, massagist_id)`；`s_reception_queue_log` 加 `queue_kind tinyint NOT NULL DEFAULT 0` |
| 代码 | `ReceptionQueueService` 的 ensureDay / assign / finish / swap / switchDuty / pickNext / revert / grab 全部带 `kind`；上钟流水记 `queue_kind`，撤销回位与抢单按流水认队 |
| 前端 | 轮牌看板/一键安排/值班/完成/调序/调店接口新增可选 `queueKind`（0 服务单、1 接待单，默认 0，老调用不受影响） |

**性质**：纯加列 + 换唯一键。老数据 `queue_kind` 全为 0（服务单队），历史流水同理，
「谁被推进」在拆分当天的口径与改动前完全一致；接待队的行在首次调用 `kind=1` 的接口/接待单上钟时惰性生成。

**依赖顺序**：必须先跑 `2026-11-19-reception-queue.sql`（建表，按文件名顺序天然在前），否则本脚本的
`ALTER ... DROP INDEX uk_date_shop_massagist` 会因表不存在而报错。守卫按 `information_schema.COLUMNS /
STATISTICS` 判存量，可重复执行；`sql/prod/` 已由 `scripts/make-prod-sql.py` 生成，
契约测试 `ReceptionQueueTwoKindContractTest` 覆盖「守卫 / 加列 / 唯一键口径 / 生产版无条件执行 / 实体与常量」。

**生产执行状态**：**2026-11-21 23:09 已执行**（`tou_mall_current`，执行前 `mysqldump` 两表到测试机
`/root/backups/tou_mall_current-queue-20261121-2309.sql`，56,067 B）。执行后复核：`s_reception_queue`
列含 `queue_kind/duty_time`、唯一键 `uk_date_shop_kind_massagist`、`s_reception_queue_log` 含 `queue_kind`，
当天 15 行数据原样保留。执行时跑的仍是老 jar（不查这两列），换 jar 在 23:24 完成。

**口径**

1. 服务单上钟只推服务单队，接待单上钟只推接待单队；接待不再挤掉正在排服务单的客人。
2. 看板顺序 = 值班区分组在前（按 `duty_time` 先点在上，未记录的按 `seq` 兜底），休息区按 `seq`；`seq` / 结果编号两套队列各算各的，不跨队跳号。
3. 接待单派单按接待队顺序取人（`RoundScheduleService.receptionOrder`）；队列当天还没起来时退回班次顺序。
4. 值班意向事项（`s_reception_issue`）暂不分队：点值班时的抢单时限对两套队列同时有效。

**回滚**：先停接待队相关入口（前端只传 `queueKind=0`），再
`ALTER TABLE s_reception_queue DROP INDEX uk_date_shop_kind_massagist, ADD UNIQUE KEY uk_date_shop_massagist (queue_date, shop_id, massagist_id);`
—— 执行前要先删掉 `queue_kind=1` 的行（`DELETE FROM s_reception_queue WHERE queue_kind=1`），否则旧唯一键建不起来。
`queue_kind` / `duty_time` 两列可留可删（旧代码不读）。

### 十九（2026-11-22）会员昵称统一「会员+后四位」

- **SQL 已执行**：`sql/2026-11-22-customer-nickname-member-tail.sql`（备份表 `c_customer_nickname_bak_20261122`），
  生产 `tou_mall_current` 执行结果 10,145 条 → `会员XXXX`、客户自取 68 条未动、`placeholder_left=0`；测试库 `tou_mall_test` 已演练幂等。
  CRM 侧 `member_name_bak_20261122` 同批执行（10,150 条），顺序为 CRM 先、轻疗后。
- **代码**：`NicknameGenerator.DEFAULT_PREFIX` 改「会员」；`BrandMemberProfileSync` 拉取/回推按 `nicknameRank` 只升不降，
  能把本地 `用户xxxx` 升到 CRM 的 `会员xxxx`，也不会把 `会员xxxx` 降回 `用户xxxx`。
- **已发布（2026-11-22 00:40）**：`deploy-prod.sh` 换 jar（主目标 jar sha256 `ff4525c4…` → 新包），
  备份 `/server/java/fully/mall-admin-1.0-SNAPSHOT.jar` 于 `/server/java/fully/backup/20261122-003959/`；
  `/health`、`/`、`/api/product/list` 均 200（冒烟首轮的 503 是重启窗口内 `no live upstreams`，1 分钟后复测通过）。
  tag `prod-qingliao-mall-20261122-0044`。

### 二十（2026-11-23）请假二级审批人（总部CEO）改由「审批设置」指定 —— **当晚已上线**

- **SQL 已执行（2026-11-23 23:1x，生产）**：`sql/2026-11-23-approval-leave-second-approver.sql` ——
  `f_approval_category ADD COLUMN second_approver_admin_id bigint NULL`。执行前快照
  `test-cityretreat:/opt/fullyu-mall-backups/db/tou_mall_current-20261123T151859Z.sql.gz`；执行后 `./scripts/sql-audit.py` → **✅ 表/列一致**。
  这一列 MyBatis-Plus 会拼进审批设置的每条查询，**不跑脚本就换 jar 会 Unknown column**。
- **代码**：请假没配流程节点时的内置规则（提前 → 店长；当天 / 店长本人 → 店长 → 总部CEO）原来读配置项
  `approval.leave.second-approver-admin-id`，现在读审批配置上的 `second_approver_admin_id`；保存审批设置时校验账号必须存在且启用，
  走内置规则却没指定二审人直接拦下。前端「审批设置 → 请假」多一个「请假审批方式：系统内置规则 / 自定义流程节点」和二审人下拉。
- **上线顺序**：先跑 SQL，再换 jar + 前端。
- **旧配置项**：生产 `/etc/fullyu/qingliao.env`（52 行）与 `application-prod.yml` 均无 `approval.*` 键，无需清理；新 jar 只读新列。
- **二审人已指定（2026-11-23）**：`f_approval_category` id **5**（店1）/ **6**（店8）→ `second_approver_admin_id=20`（Fiona，13671661152，启用），
  两行 `f_approval_flow_node` 均为 0 条 → 内置规则生效；当天请假、店长本人请假会落到 Fiona。
- **发布（2026-11-23 23:04 dist / 23:22 jar，`5025d02`）**：jar `977d99e5…`（311,694,795 B）替换 `6b4f649f…`，
  备份 `/server/java/fully/backup/20261123-232136/`；dist 备份 `dist.bak-20261123-230430`；`/health`、`/`、`/api/product/list` 200；
  23:25 真实顾客小程序登录建号成功（顺带验证新 jar）。完整记录见 `docs/ops/生产上线手册.md` §21。
- **仍未验证**：① 生产「审批设置 → 请假 → 配置」页实际保存一遍；② 真发起一张**当天**请假看它是否落到 Fiona。
- **回滚**：旧 jar 不读新列，回滚代码即可；`second_approver_admin_id` 可留可删。
