# CRM 迁到 MySQL（RDS）

2026-11-17 完成：生产库从 SQLite 文件切到 RDS `crm` 库（杭州 `rm-bp127cdsipvc7dtse`），开发/测试仍用 SQLite。

## 1. 为什么是双 schema

测试脚手架（`apps/server/src/testing/harness.ts`）复制模板 SQLite 库起应用，本地开发也是 SQLite。直接把 `schema.prisma` 的 provider 改成 mysql 会把这两条链路一起打断。

所以：

| 文件 | 用途 | 谁在跑 |
|---|---|---|
| `apps/server/prisma/schema.prisma` | SQLite | 本地开发、Jest、种子 |
| `apps/server/prisma/schema.mysql.prisma` | MySQL | 生产构建（**自动生成，勿手改**） |

生成器：`apps/server/scripts/gen-mysql-schema.mjs`。规则只有两条：

1. `provider` 换成 `mysql`；
2. 字段名以 `Json / Reason / Note / Detail / Description` 结尾的 `String` 加 `@db.VarChar(2000)`。

规则 2 的原因：SQLite 不校验长度，MySQL 下 Prisma 默认把 `String` 建成 `VARCHAR(191)`，而现网 `rule_set_versions.rules_json` 已有 802 字符——不定长会被截断（严格模式下直接报错）。

为什么是 2000 而不是 `TEXT`：这些字段大多带 `@default("")` / `@default("[]")`，MySQL 的 `TEXT` 不能带字面量默认值；2000（utf8mb4 下 8KB/列）在行大小 65535 内也够用（最紧的 `BrandCardVersion` 固定列 7.7KB + 5 个长字段 = 47.7KB）。如果将来单个 JSON 超过 2000 字符，改成 `@db.Text` 并去掉该字段的 `@default`，同时在代码里补默认值。

## 2. 命令

```bash
pnpm --filter @fullyu/crm-server schema:mysql        # 生成 schema.mysql.prisma
pnpm --filter @fullyu/crm-server schema:mysql:check  # CI 用：不一致就失败
pnpm --filter @fullyu/crm-server db:mysql:push       # 建表/同步（需要 DATABASE_URL 指向 MySQL）
pnpm --filter @fullyu/crm-server build:mysql         # 生成 mysql client + 编译
```

生产启动前必须用 `schema.mysql.prisma` 生成 client，否则运行时 client 还是 SQLite（报 `the URL must start with the protocol 'file:'`）。

## 3. 数据搬运

`apps/server/scripts/copy-sqlite-to-mysql.cjs`：

```bash
SRC=/path/crm.db DST='mysql://user:pass@host:3306/crm' node scripts/copy-sqlite-to-mysql.cjs
```

- 两个 client：SQLite 读、MySQL 写；
- 按 `relationFromFields` 拓扑排序，父表先写；
- 每 200 行一批 `createMany`；
- 每张表写完后比 `count()`，不一致退出码 2。

现网实测：33 张表、27k 行、约 4 秒。

## 4. 踩过的坑

| 现象 | 原因 | 处理 |
|---|---|---|
| `Row size too large (65535)` | `VarChar(4000)` 在 utf8mb4 下每列 16KB，多列超限 | 降到 2000 |
| `Argument periodKey is missing` | **线上部署的 schema 比仓库 HEAD 旧**（仓库已改自然季 `periodKey`/`slot`，线上仍是 `month_key`，表里没这两列） | 迁移必须用**线上 schema** 生成 MySQL 版；新库要先 `--force-reset` 再灌 |
| 时间看起来差 8 小时 | SQLite 存 epoch 毫秒，MySQL 存 `DATETIME(3)`；Prisma 两边都按 UTC 读写 | 用 Prisma 客户端比对 `getTime()`，一致即可；**不要**用 SQL 直接比字面值 |
| `length()` 对不上 | MySQL 返回字节数，SQLite 返回字符数 | 用 `CHAR_LENGTH()` 比 |
| `Rerserved user or privileges can't be modified` | RDS 禁止授予 `FLUSH_TABLES` | 备份账号只给 `RELOAD`（mysqldump 8.4 的 `FLUSH TABLES` 认这个） |
| dump 里带 `GTID_PURGED` | RDS 开了 GTID | `mysqldump --set-gtid-purged=OFF` |

## 5. 回滚

`/etc/fullyu-crm/crm.env` 的 `DATABASE_URL` 改回 `file:/opt/fullyu-crm/data/crm.db`，重启 `fullyu-crm`。SQLite 文件在切换时已冷备到 `/opt/fullyu-crm/backups/`，并保留 7 天。
