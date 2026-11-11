# 时叙 SQLite → MySQL 迁移：执行任务书 v2（2026-11-15）

> v1 是提问式提示词；v2 已经把 v1 里的三个待确认问题**核实完**，写进「已核实的事实」，并把会直接炸的坑（`VARCHAR(191)`、时区、排序规则）改成硬性口径。
> 用法：把 `## 任务书` 整段复制给在 `~/Desktop/fullyu-platform/shixu` 打开的会话；部署侧动作见文末。

---

## 任务书（从这里开始复制）

```
任务：把时叙（teahour）后端从 SQLite 迁到 MySQL。生产上线前置项。只改 shixu/，不碰 presence/crm/qingliao。

════════ 一、已核实的事实（不用再查，直接用；如需复核给出命令） ════════

代码与环境
- 仓库 ~/Desktop/fullyu-platform/shixu，git 根在上一层；服务端 apps/server
- Prisma schema：apps/server/prisma/schema.prisma，provider="sqlite"，28 个 model
- 迁移目录 7 个：0_init、20261030000000_customer_profile、20261031000000_audit_hardening、
  20261031023517_member_coupons、20261031112000_product_image、20261101090000_product_sort_order、
  20261105090000_home_content（v1 写的"8 个"是错的）
- SQLite 方言只出现在 2 个文件：audit_hardening、member_coupons，内容是
  PRAGMA foreign_keys / PRAGMA defer_foreign_keys（SQLite「建新表→搬数据→改名」的改表套路）。
  没有 strftime / date('now') / AUTOINCREMENT / WITHOUT ROWID，也没用 CREATE TRIGGER / VIEW。
  → 结论：基线重建是因为「改表套路 + provider 不同」，不是因为有函数方言。
- 服务端源码里 **零** $queryRaw / $executeRaw / Prisma.sql，没有 SQLite 方言泄漏到业务代码。
  复核：grep -rn '\$\(query\|execute\)Raw' apps/server/src
- 测试脚手架是 SQLite 文件绑定的：test/global-setup.ts 用 `prisma db push --force-reset` 造
  template.db 并写 template.path；src/testing/harness.ts 每个 spec `fs.copyFileSync(template, dbFile)`。
  切 provider 后这套必须改（见交付物 6）。
- 生产机 121.40.119.57：服务 teahour-api.service，端口 18787，env /etc/teahour/api.env
  （DATABASE_URL=file:/var/lib/teahour/teahour.db），Node /opt/teahour/runtime（v20.19.5，别动）
- 目标库 RDS rm-bp127cdsipvc7dtseno.mysql.rds.aliyuncs.com:3306（MySQL 8.0.36）
  · teahour（生产，已建、空） · teahour_rehearsal（演练，已建）
  账号密码见 ~/.fullyu-secrets/SERVERS.md 的 fully 账号（本地可直连）
- 现网数据量：28 表，stock 136、logs 135、order_items 42、order_units 34、orders 25，其余更小。
  **都是测试数据**，不必为"历史脏数据"做兼容，但导入遇到约束冲突必须报错，不许静默跳过。

类型与语义现状（决定 MySQL 口径的四条）
1. schema 里 **0 个 Prisma `Json` 字段**。10 个名字带 json 的列都是 `String`，代码里自己做
   JSON.parse / stringify。→ 迁移**保持 String**，不要改成原生 Json（改了 Prisma 读出来是对象不是字符串，
   所有解析点全崩，且 JSON 列不能有默认值、不能直接建索引）。
2. Prisma 的 String 在 MySQL 上默认是 **VARCHAR(191)**。当前有 10 个列装的是 JSON / 网关原文（见交付物 1 的表），
   191 字符远远不够 → strict mode 下 `Data too long for column`。这是本迁移的第一炸点。
3. 时间语义是 **UTC**：SQLite 侧 `DEFAULT CURRENT_TIMESTAMP` 是 UTC，代码写入全是 `new Date()`（UTC 语义）。
   典型证据：auth.service.ts 的生日用 `new Date(text + 'T00:00:00.000Z')` 存、用
   `birthday.toISOString().slice(0,10)` 读——两侧都靠 UTC 才对齐。→ MySQL 侧必须同样存 UTC，不能改成 +08:00。
   唯一用到上海时区的是 orders/daily-sweep.ts，它用 Intl + 显式 +08:00 算日界，不依赖库时区。
   ★ 三个项目的存储口径不同，别"统一成 +8"：
     · 在场（Prisma 5 + 同一个 RDS）：存 **UTC**，没改过 RDS 时区。证据：presence-ledger.service.ts 用
       `Date.UTC(y, m-1, 1) - CST_OFFSET_MS` 做区间查询；stock.service.ts 注释「DATE 列统一 UTC 零点，
       驱动按 UTC 截取」。→ **时叙跟这个**。
     · 轻疗（Spring Boot + MyBatis + 同一个 RDS）：存**北京时间墙钟**。它的 DDL 是
       `create_time DATETIME DEFAULT CURRENT_TIMESTAMP`，值由数据库按 session 时区生成，
       JDBC 串带 `serverTimezone=Asia/Shanghai`。
     · 两种都能自洽跑，差别只在"谁来解释那个墙钟值"。判据是 ORM：Prisma 走字面量语义 → UTC。
   ★ MySQL 的 `time_zone` 只影响 NOW()/CURRENT_TIMESTAMP 和 TIMESTAMP 列，**不影响 DATETIME 列的字面量存取**。
     结论：时叙不需要改任何 RDS 时区；而实例级 time_zone 现在大概率是 +08:00 在给轻疗用，
     **绝对不许改成 +00:00**——那会把轻疗新写入的时间整体打偏 8 小时。
     ★ 跨系统（在场/时叙/轻疗/CRM 互传）的完整口径见同目录 `跨系统时间口径.md`，同机部署前必须过一遍。
4. 排序规则：现网 SQLite 是 BINARY（大小写敏感）。目标库当初建的是 `utf8mb4_0900_ai_ci`（大小写/重音不敏感），
   会让 `username`、`memberCode`、订单 `number`、`businessKey`、`dedupeKey`、PaymentIntent.key、
   Customer.openId 这些精确身份键的语义发生漂移（两个不同值被判成同一个）。部署侧会把库默认排序规则改成
   `utf8mb4_0900_bin`（NO PAD，等价于 SQLite BINARY）；你只需保证 baseline DDL 里不写死 ai_ci。

════════ 二、硬约束 ════════

1. 只改 shixu/；不重构业务逻辑、不改接口契约、不动前端。
2. 不在服务器上构建；产物本机构建、必要时 scp。**不要在 121.40 上跑 migrate 或搬数据。**
3. 迁移基线重建：以当前 schema 生成**一个** baseline 到 MySQL，7 个 SQLite 迁移整体归档为
   `prisma/migrations.sqlite/`（含 migration_lock.toml），不要留在生效目录里。
4. 类型口径（这是 v1 写错、v2 已修正的部分，按这个执行）：
   · 金额一律整数分 Int，禁止 float/double/decimal 承载金额
   · 时间一律 DateTime，MySQL 侧必须是 **DATETIME(3)**，**存储 UTC**；不要做任何 +8 小时换算，
     也不要在迁移脚本里转换时区（源值本身是 epoch 毫秒，直接 new Date(ms) 写入即等价）
   · JSON 列保持 String，加 `@db.Text`；**禁止**改成原生 Json
5. 外键与级联逐条核对。注意 SQLite 侧 Prisma 本来就开了 `PRAGMA foreign_keys`，现网数据是满足外键的，
   所以这里不是"扫脏数据"问题，而是"搬运顺序 + 级联删除行为"问题。
6. Counter 表当前值必须原样搬（单号生成，错一位就重号，资金相关）。
7. id 是字符串 cuid，不要改成自增。

════════ 三、交付物 ════════

1) schema.prisma：provider 改 "mysql"（url 仍 env("DATABASE_URL")）+ 补齐长文本类型

   规则：JSON 序列化结果 / 第三方原文 → `@db.Text`；自由文本 → 显式 VarChar；URL → VarChar(500)；其余保持默认。

   @db.Text（这 10 列本来就没有 @default，保持无默认值）：
     Setting.valueJson, Store.channelsJson, Store.positionsJson, Product.tempsJson,
     Role.permsJson, Approval.payloadJson, PrintJob.payloadJson,
     PaymentIntent.responseJson, RefundIntent.linesJson, IdempotencyKey.responseJson

   显式 VarChar：
     Log.detail                @db.VarChar(2000)   // 审计明细，长 JSON 片段
     PrintJob.lastError        @db.VarChar(2000)   // 网关/异常原文
     PaymentIntent.failReason  @db.VarChar(500)
     RefundIntent.failReason   @db.VarChar(500)
     RefundIntent.reason       @db.VarChar(500)    // 本来 @default("")
     Store.address / addressEn          @db.VarChar(500)
     Product.descZh / descEn            @db.VarChar(500)
     Banner.imageUrl / Banner.linkValue / HomeAsset.imageUrl / Product.imageUrl / Customer.avatarKey
                                        @db.VarChar(500)

   不要动：Order.note、Loss.note/decisionNote、Approval.comment/resultNote、Expense.memo
   （中文 191 字符够用，且都带 @default("")，TEXT 列加字面量默认值会踩 MySQL 版本差异，别自找麻烦）。

2) Prisma 迁移基线（只有一条）
   mkdir -p prisma/migrations/0_baseline
   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script \
     > prisma/migrations/0_baseline/migration.sql
   printf 'provider = "mysql"\n' > prisma/migrations/migration_lock.toml
   生成后**必须人工读一遍并修正**，逐条断言：
     a. 没有 `utf8mb4_0900_ai_ci`（Prisma 会给每张表写 DEFAULT CHARACTER SET/COLLATE，全换成 utf8mb4_0900_bin；
        不去掉的话库级默认排序规则白设）
     b. 10 个 JSON 列是 TEXT/LONGTEXT，不是 VARCHAR(191)
     c. 外键是文件末尾的 ALTER TABLE ... ADD CONSTRAINT，不是内联在 CREATE TABLE 里；
        若有内联，手工拆到末尾（否则建表顺序会失败）
     d. 所有 fk 的 ON DELETE 与 schema 里的 onDelete 一致；没有任何表缺主键
   全程只用 `prisma migrate deploy`；**不要用 migrate dev / db push 碰 teahour 和 rehearsal**

3) scripts/migrate-sqlite-to-mysql.ts
   · 读源：`sqlite3 -json <db> "SELECT * FROM <table>"`（本机 3.51，无需新依赖）。
     provider 切到 mysql 后 Prisma 读不了 SQLite；备选方案是第二份 schema（schema.sqlite.prisma + 独立 output），
     但优先用 sqlite3 CLI，简单且读到的是原始字节。
   · 写入：Prisma Client（mysql），字段映射用 `Prisma.dmmf` 驱动，**不要手抄 28 个 model**：
     DMMF 给出 model → 表名 → 列名 → 字段类型，据此做 0/1→boolean、int(ms)→DateTime、null 透传。
     遇到未知字段类型直接抛错，不要静默吞掉。
   · 表顺序：按 DMMF 关系图拓扑排序（父先子后）插入；删除时反向。校验拓扑覆盖全部 28 个 model。
   · 幂等：`--mode=reload`（默认）= 单事务内 反向 DELETE 全表 → 正向 createMany 全量重灌。
     这比 upsert 简单且真正幂等（数据量小，一次事务没问题）。禁止用 `SET FOREIGN_KEY_CHECKS=0` 绕外键。
   · 参数：`--source <sqlite 文件>` `--target <mysql URL>` `--dry-run` `--only <table,...>`
   · 打印每表名/搬运行数/耗时；Counter 在搬运前后各打印一次值。

4) scripts/verify-migration.ts（迁移的验收主体）
   · 两侧都用同一套规范化函数算内容摘要，输出 PASS/FAIL 表：
     count 相等 | 每行列集合相等 | 每行规范化后逐列相等
     规范化：DateTime → epoch ms；boolean → 0/1；Float → 固定精度字符串；null → '∅'；其余原样；
     行按主键元组排序；表级摘要 = sha256(排序后的规范化行)
   · 硬断言（缺一不可）：
     a. DateTime 列由 DMMF 自动枚举（当前 36 个），逐列断言「源 epoch 集合 == 目标 epoch 集合」，
        不只比 hash——hash 能过但时区整体偏移的情况必须靠这条抓
     b. Counter 逐行值相等，并单独打印
     c. 目标库 information_schema 断言：库默认 collation = utf8mb4_0900_bin；所有 DATETIME 列
        datetime_precision = 3；10 个 JSON 列 data_type ∈ {text, mediumtext, longtext}
   · 输出 artifacts/migration-verify-<时间戳>.json，便于回贴

5) 行为层等价验证（替代 v1 那条含糊的"两侧各跑一遍"）
   顺序不能颠倒：
   ① 切 provider **之前**，在 SQLite 上跑一遍 `pnpm --filter @teahour/server test`，记录通过/失败数，存成基线
   ② 切 MySQL 后，同一套用例必须达到同样的通过数（不允许多、不允许多跳过）
   为此改测试脚手架（交付物 6），并在 rehearsal 库上跑。
   另外 8 条手工冒烟（连 rehearsal，不碰生产）：登录/权限范围 · 商品列表与图片 · 下单+支付回调 ·
   退款申请与审批 · 会员券核销 · 打印任务领取 · 每日取餐归档 · 健康检查 /api/health

6) 测试脚手架改 MySQL 模式
   · test/global-setup.ts：若 `TEST_DATABASE_URL` 存在则走 MySQL 分支——URL 里必须含 `rehearsal` 或 `_test`，
     否则直接抛错（防误伤）；用 `prisma db push --force-reset --skip-generate` 建结构 + `prisma/seed.ts` 灌种子；
     把「使用 MySQL + 连接串」写进 pointer 文件，替换原来的 template.db 指针
   · src/testing/harness.ts：读 pointer；MySQL 模式下设 `process.env.DATABASE_URL = TEST_DATABASE_URL`，
     并在每个 spec 的 beforeAll 做「TRUNCATE 全表（反向 FK 顺序）+ 重灌 seed」，
     因为原来的隔离手段是复制 .db 文件，MySQL 上没有等价物
   · 把 seed 抽成可从测试调用的函数（`seedDatabase(prisma, opts)`），CLI 入口复用同一份逻辑
   · 若 RDS 往返延迟让全套太慢，允许本地 docker mysql:8.0 跑日常；但 rehearsal 上至少完整绿一遍

7) docs/mysql-migration-2026-11.md：改了哪些文件、baseline 的关键修正（4 条断言）、执行步骤、
   验收结果（贴 verify 输出与 jest 通过数对比）、回滚步骤、遗留风险

════════ 四、执行顺序（一步一验，前一步不绿不进下一步） ════════

1. 基线快照：在 SQLite 上跑全套 jest，记录通过数；`sqlite3 db "PRAGMA integrity_check"` = ok
2. 从 121.40 拉一份 SQLite 只读副本到本地（scp），之后所有搬运只读这份副本
3. 改 schema（provider + 交付物 1 的类型表）→ `npx prisma validate` 通过 → `prisma generate`
4. 归档 migrations.sqlite/ → 生成 baseline → 人工过 4 条断言 → `grep -c utf8mb4_0900_ai_ci` 必须为 0
5. rehearsal：`prisma migrate deploy` → information_schema 断言（collation / precision / 列类型）
6. 跑 migrate 脚本两遍（第二遍必须成功且结果相同 = 幂等），再跑 verify 脚本 → 0 差异
7. 改测试脚手架 → 全套 jest 在 MySQL 上通过数 == 步骤 1 的基线
8. 本机起服务连 rehearsal，过 8 条冒烟
9. 生产空库 teahour：由部署侧执行 `migrate deploy`，你的脚本连上去搬现网副本 + verify（同样 0 差异）
10. 写 docs/mysql-migration-2026-11.md，回贴 verify 输出 + jest 通过数对比 + 冒烟结论

════════ 五、验收标准（缺一不可） ════════

- `prisma validate` 通过；`prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma`
  输出为空（baseline 与 schema 无漂移）
- baseline 里无 ai_ci、无 191 的 JSON 列、外键在末尾；库默认 collation = utf8mb4_0900_bin
- 所有 DATETIME datetime_precision = 3
- `@default(now())` 实测：MySQL 侧 create 不传 createdAt，读回与 `Date.now()` 相差 ≤ 10s（不是 8 小时）
- verify 脚本 0 差异：每表 count、行集合、36 个 DateTime 列 epoch 集合全等；Counter 值一致
- migrate 脚本连跑两遍结果一致（幂等）
- jest 全套在 MySQL 上通过数 == 迁移前 SQLite 基线
- 8 条冒烟全过；/api/health 200；后台能登录、能下单、能看单
- 回滚演练通过：DATABASE_URL 改回 `file:` 副本并重启，服务起得来、数据是切换前的样子

════════ 六、回滚 ════════

- 切回 `DATABASE_URL=file:/var/lib/teahour/teahour.db` + `systemctl restart teahour-api`
- SQLite 只读副本保留 7 天，切回用的是切换前的快照
- **MySQL 期间产生的新数据不回流**（这段时间只允许测试流量，真实业务数据一律以 SQLite 侧为准）
- 回滚步骤写进 docs/mysql-migration-2026-11.md，部署侧照做

════════ 七、不要做 ════════

- 不要改 presence / crm / qingliao 任何文件
- 不要在 121.40 上跑 migrate、db push、或数据搬运
- 不要为了"跑通"放宽唯一索引、删外键、把 Text 改回 191、把时间改成 +08:00
- 不要改 id 为自增、不要用 float 存金额
- 不要引入新依赖（读 SQLite 用 sqlite3 CLI，Prisma 已经够用）
- 不要在本机开发环境继续留 SQLite：一份 schema 一个方言，开发/测试/演练/生产都走 MySQL，
  本地用 docker mysql:8.0；否则本地 db push 会把 sqlite 语义带回来

════════ 八、遗留风险（写进文档，不要藏） ════════

1. 时区：**不改 RDS 实例/全局 `time_zone`**（轻疗同实例在用，见事实 3）。时叙的 DateTime 全部由应用传入、
   存 DATETIME(3)、往返不经过服务端时区转换，因此与实例 time_zone 无关。
   唯一需要实测的是 `@default(now())`（时叙 5 处、在场 59 处）由谁求值：在 rehearsal 上 create 一行、
   不传 createdAt、读回比对 `Date.now()`（容差 ±10s）。若差 8 小时，修法是让应用显式传值
   （或 Prisma 中间件注入），**不是**去改 RDS 时区。
2. `_bin` 排序规则意味着 `LIKE` / `=` 大小写敏感（与现网 SQLite 一致）。
   以后若要做大小写不敏感搜索，用规范化列或应用层处理，不要改回 ai_ci。
3. uploads 仍是本地盘，双机部署需先上 OSS——属阶段 2，不阻塞本次迁库。
4. 迁移只保证「数据 + 结构 + 行为」等价，不包含性能调优；索引沿用现状。

════════ 九、开工前 5 分钟自检 ════════

1. `npx prisma -v` 版本与 package.json 一致；`git status` 干净，改动只落在 shixu/
2. 能连上 rehearsal：`mysql -h <RDS> -u fully -p -e "select @@version, @@collation_database"`
3. 能读到 SQLite 副本：`sqlite3 <副本> "select count(*) from orders"`
```

## 任务书结束

---

## 部署侧配套（我已完成 / 待做）

| 项 | 状态 |
|---|---|
| RDS 建库 `teahour`（空） | ✅ 2026-11-11 |
| RDS 建库 `teahour_rehearsal`（演练） | ✅ 2026-11-11 |
| 每日 SQLite 备份（integrity_check、逐表行数、14 天保留） | ✅ 2026-11-11 |
| 恢复演练（28 表行数全等） | ✅ 2026-11-11 |
| **改库默认排序规则**（`ALTER DATABASE teahour / teahour_rehearsal CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;`，库为空，改在 baseline 之前） | 待做（迁移前置，必须） |
| **记录 RDS `time_zone` 现值并锁定不修改**（`SELECT @@global.time_zone, NOW(), UTC_TIMESTAMP()`，预计 +08:00）。同实例跑着轻疗 `tou_mall_current`/`tou_mall_demo`，它们靠 `DEFAULT CURRENT_TIMESTAMP` 写北京时间，改实例时区会打偏其生产数据 | ✅ 2026-11-15 决定：不修改 |
| 生产空库 `teahour` 执行 `prisma migrate deploy` + 搬运 + verify | 待迁移验收后 |
| 切换上线（改 `/etc/teahour/api.env` + `systemctl restart teahour-api`），00:00–06:00 窗口 | 待迁移验收后 |
| 部署包内需带重新 `prisma generate` 过的 client | 切线上时确认 |
| uploads 改 OSS（两台机器共享） | 阶段 2，不阻塞迁库 |

## v2 修订记录（相对 v1）

1. **事实纠错**：迁移目录 7 个不是 8 个；SQLite 方言只有 PRAGMA（2 个改表式迁移），不是 date()/strftime；源码零 raw SQL。
2. **删掉「Json 字段用 MySQL 原生 Json」**：schema 里 0 个 Json 字段，10 个 `*_json` 是 String，改成原生 Json 会把所有解析点打崩。改为「保持 String + `@db.Text`」。
3. **新增 `VARCHAR(191)` 口径**：Prisma 的 String 在 MySQL 默认 191，装 JSON 的列必炸；附具体列清单与类型表（v1 完全没有这条）。
4. **时区口径从「按 Asia/Shanghai 写入」改为「存 UTC」**：v1 那条会整体偏 8 小时（生日、日报、退款原交易日期全错）。附代码证据。
5. **新增排序规则口径**：ai_ci 会让精确身份键语义漂移，改 `utf8mb4_0900_bin`，并要求 baseline 里不写死 ai_ci。
6. **「先扫脏数据」改为「搬错必须报错」**：现网是测试数据，扫脏数据是伪工作量；真正要防的是静默跳过。
7. **补可执行的基线生成方式**（migrate diff + 4 条 DDL 断言），并明确全程只用 `migrate deploy`。
8. **「双跑验证」改成可执行的两层**：SQLite 侧先跑 jest 记基线 → MySQL 侧同数通过；再 8 条冒烟。附测试脚手架改 MySQL 的具体位置。
9. **verify 增加硬断言**：36 个 DateTime 列 epoch 集合逐列相等、information_schema 断言、migrate 幂等连跑两遍。
10. **删掉「先回答我三件事」**：已核实，改成「开工前 5 分钟自检」，去掉角色混乱的元信息（原文混着"我/部署侧"，粘过去会误导）。
11. **撤回 v2 的「确认 RDS `time_zone=+00:00`」**（2026-11-15 修正）：该 RDS 与轻疗共用，轻疗依赖 session 时区 +08 的 `DEFAULT CURRENT_TIMESTAMP`，改实例时区会打偏轻疗生产数据；且 MySQL `time_zone` 不影响 DATETIME 字面量存取，时叙本就不需要改。口径明确为：时叙跟在场（Prisma → 存 UTC），不跟轻疗（MyBatis → 存北京时间），并把 `@default(now())` 的求值方改成验收项而非假设。