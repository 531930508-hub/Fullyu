# 时叙 SQLite → MySQL 迁移：执行提示词（直接粘到时叙那个项目里用）

> 用途：把这段整段粘给在 `~/Desktop/fullyu-platform/shixu` 打开的会话，让它在**那个项目里单独改**。
> 部署侧（我）已经准备好目标库与环境事实，见「已就绪」一节；迁移完再回部署侧做上线。

---

## 复制从这里开始

```
任务：把时叙（teahour）后端从 SQLite 迁到 MySQL。这是生产上线的前置项，只改 shixu/ 目录，不碰 presence/crm/qingliao。

【已就绪的环境事实】
- 代码：~/Desktop/fullyu-platform/shixu（单仓库的一层子目录，git 根在上一层）
- ORM：Prisma，schema 在 apps/server/prisma/schema.prisma，当前 provider="sqlite"，28 个 model，8 个 SQLite 迁移目录
- 运行时：生产机 121.40.119.57，服务名 teahour-api.service（不是 teahour），端口 18787，
  env 在 /etc/teahour/api.env（DATABASE_URL=file:/var/lib/teahour/teahour.db），
  Node 用 /opt/teahour/runtime（v20.19.5，属于时叙自己，别动；系统另有一套 /opt/node20）
- 目标库：RDS rm-bp127cdsipvc7dtseno.mysql.rds.aliyuncs.com:3306（杭州，MySQL 8.0.36）
  · teahour             ← 生产用，已建好、当前为空，utf8mb4_0900_ai_ci
  · teahour_rehearsal   ← 演练用，已建好
  账号与密码见 ~/.fullyu-secrets/SERVERS.md 的 fully 账号（本地与服务器都能连上）
- 现网数据量很小：28 表，最大表 stock 136 行、logs 135、order_items 42、order_units 34、orders 25

【硬约束】
1. 只改 shixu/；不重构业务逻辑、不改接口契约、不动前端。
2. 不在服务器上构建；产物本机构建，必要时 scp。不要在 121.40 上跑 migrate。
3. 迁移基线必须重建：以 MySQL 空库生成**一个**新的 baseline 迁移，不要把 8 个 SQLite 迁移 SQL 照搬（SQLite 方言会失败）。
4. 类型口径：
   · 金额一律整数分（Int），禁止 float/double/decimal 承载金额
   · 时间统一 DateTime；SQLite 里是毫秒整数、MySQL 里要是 DATETIME(3)，写入按 Asia/Shanghai，读取不做二次时区换算
   · Json 字段用 MySQL 原生 Json
5. 逐条核对唯一索引、外键与级联：SQLite 默认不强制外键，MySQL 会强制，历史脏数据会在导入时炸——遇到就报出来，不要静默跳过或强改数据。
6. Counter 表（单号生成）的当前值必须原样搬过去；错一位，单号就会重复，这是资金相关，验收必须专门验。
7. id 是字符串 cuid，不要改成自增。

【要交付的东西】
1. schema.prisma provider 改 mysql（url 仍读 env("DATABASE_URL")）
2. Prisma 迁移：一个 baseline + 后续变更，`prisma migrate status` 干净
3. scripts/migrate-sqlite-to-mysql.ts：按外键依赖顺序搬数据，支持 --source sqlite 文件与 --target mysql URL，幂等（可重复跑），打印每表搬运行数
4. scripts/verify-migration.ts：逐表 count 对比 + 关键表（orders / order_items / order_units / payment_intents / refund_intents / customer_coupons / coupons / counters / stock / products）内容级 hash 对比，输出 PASS/FAIL 表；Counter 单独打印前后值
5. docs/mysql-migration-2026-11.md：改了哪些文件、迁移步骤、回滚步骤（改回 DATABASE_URL + 重启 teahour-api.service，保留 SQLite 只读副本 7 天）、验证结果、遗留风险
6. 双跑验证说明：同一套请求（点单 → 支付回调 mock → 退款 → 会员券核销 → 打印任务 → 会员页）在 SQLite 与 MySQL 两侧各跑一遍，断言响应与落库结果一致

【验收标准（缺一不可）】
- verify 脚本 0 差异，Counter 值一致
- 8 条冒烟路径在 MySQL 侧全过
- `prisma migrate status` 干净；`prisma validate` 通过
- 用 MySQL 起服务后 /api/health 200，管理后台能登录、能下单、能看单
- 回滚演练：DATABASE_URL 改回 SQLite，服务能起来、数据是切换前的样子

【不要做】
- 不要改 presence/crm/qingliao 任何文件
- 不要在生产机 121.40 上执行 migrate 或数据搬运（那里只做"切 env + 重启"，由部署侧做）
- 不要为了"跑通"放宽唯一索引、删外键、改字段类型
- 不要引入新依赖，除非 Prisma 必需

【先回答我三件事再动手】
1. 8 个 SQLite 迁移里有没有写死的 SQLite 语法/函数（date('now')、strftime、AUTOINCREMENT、WITHOUT ROWID 等），分别在哪几个文件
2. 28 个 model 里哪些有 Json 字段、哪些时间字段带默认值（CURRENT_TIMESTAMP 之类），MySQL 侧要怎么写才等价
3. SQLite 现网数据里有没有会撞 MySQL 唯一索引/外键的历史脏数据（用校验脚本先扫一遍，别先迁）
```

## 复制到这里结束

---

## 部署侧配套（我已完成 / 待做）

| 项 | 状态 |
|---|---|
| RDS 建库 `teahour`（utf8mb4_0900_ai_ci） | ✅ 2026-11-11 |
| RDS 建库 `teahour_rehearsal`（演练） | ✅ 2026-11-11 |
| 每日 SQLite 备份（含 `integrity_check`、逐表行数、14 天保留） | ✅ 2026-11-11 |
| 恢复演练（28 表行数全等） | ✅ 2026-11-11 |
| 切换上线（改 `/etc/teahour/api.env` + `systemctl restart teahour-api`） | 待迁移验收后，在 00:00–06:00 窗口做 |
| 上传目录改 OSS（两台机器共享） | 阶段 2 一起做，不阻塞迁库 |