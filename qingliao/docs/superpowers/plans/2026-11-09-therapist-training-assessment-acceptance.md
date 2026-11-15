# 内训师培训考核与三人认证 · 测试环境验收记录

- 执行时间：2026-11-09 ～ 2026-11-10
- 测试环境：`mall-test.fullyu.cn`（后端 `/opt/fullyu-mall-test`，库 `tou_mall_test`）
- 开关：`INCENTIVE_TEAM_CERT_ENABLED=true`（见 `start-backend.sh`）
- 数据截止：2026-11-10

## 构建与测试

### 后端

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 全量测试（排除 OSS） | `mvn -pl mall-admin -am -DskipTests=false -Dtest='!OssServiceImplTest' -DfailIfNoTests=false test` | `Tests run: 575, Failures: 0, Errors: 0, Skipped: 1`，BUILD SUCCESS |
| 培训相关定向测试 | `TrainingExportServiceTest / TrainingRecordSqlContractTest / TrainingRecordPageTest` | 12 个用例全部通过 |
| 打包 | `mvn -pl mall-admin -am -DskipTests package` | 生成 311MB fat jar |

说明：`OssServiceImplTest` 依赖外网 OSS 配置，按计划排除；包含它时 Spring 上下文会等待 RabbitMQ 消费者启动超时，不适合在无 broker 的测试机执行。

### 前端

| 项 | 命令 | 结果 |
| --- | --- | --- |
| Node 测试 | `node --test tests/*.test.mjs` | 186 个用例全部通过 |
| 构建 | `npm run build` | 成功 |
| 测试环境构建 | `npm run build:test` | 成功，`dist/` 19MB，日志无 `Module not found` / `Unexpected token` |

## 数据库迁移

对 `tou_mall_test` 执行 `sql/2026-11-09-training-team-cert.sql`，重复执行两次均返回 `EXIT=0`，输出 `xxx exists` 提示，幂等。

- `s_massagist.is_trainer`：存在，`tinyint NOT NULL DEFAULT 0`
- `s_massagist_training_cert.source`：存在，`varchar(16) NOT NULL DEFAULT 'LEGACY'`
- `s_massagist_training_assessment`：存在

未对 `tou_mall_current`、`tou_mall_demo` 执行。

## 开关与身份

| 场景 | 结果 |
| --- | --- |
| 开关开，普通后台账号 `/admin/info` | `trainer: false` |
| 内训师标记（DB） | 阿舍 Asher(5)、柠萌 Mia(12)、月月 Luna(22) 均为 `is_trainer=1`，且三人分别提交过考核记录 |
| 开关开，`/incentive/training-records` | `teamCertEnabled: true`，返回 13 人合作中疗愈师 |
| 开关关，`/incentive/trainer/profile` | `{"code":500,"message":"内训考核功能尚未开放"}` |
| 开关关，`/incentive/training-records` | `teamCertEnabled: false`，矩阵仍正常返回（200） |
| 关闭再恢复后 | `teamCertEnabled: true`，13 人，恢复正常 |

## 三人认证链路（Step 5）

数据证据（`s_massagist_training_cert`）：

| 门店 | 疗愈师 | 项目 | 来源 | 通过日期 | 认证时间 | 团队人数 |
| --- | --- | --- | --- | --- | --- | --- |
| 人广来福士店 | 莎莎 Shasha | 全感舒筋 · 头部 | 人工特批 | 2026-11-06 | 2026-11-09 22:23:14 | 0 |
| 人广来福士店 | 莎莎 Shasha | 全感舒筋 · 眼部 | 三人认证 | 2026-11-09 | 2026-11-09 22:42:33 | 3 |

- 眼部由阿舍 Asher、柠萌 Mia、月月 Luna 三位内训师各提交一次通过，`passed_at` 取最后一位提交的 2026-11-09。
- 认证抽屉显示“已认证、三人认证、3 位内训师”，并列出 3 条考核记录（按考核日期倒序，可作废单票）。
- 头部项目为超管人工特批，团队人数 0、来源“人工特批”。

## 盲考与锁定（Step 6）

内训师 H5 页 `/trainer-assess` 已按内训师账号走通提交（上述 3 条记录即由内训师账号产生）。锁定规则由 `TrainingAssessmentService` 单测覆盖：

- 已认证项目再次提交 → “该疗愈师该项目已认证，无需再考核”
- 10 分钟内重复提交 → “请勿重复提交”
- 超过 30 天补记 → “最多补记30天内的考核”
- 给自己考核 → “不能给自己做考核”

## 撤销、作废与人工特批（Step 7）

- 抽屉内“撤销认证”“作废此票”按钮均可见；接口 `POST /incentive/training-records/{certId}/revoke`、`POST /incentive/training-assessments/{id}/void`。
- 人工特批走 `ManualCertDialog`，原因必填，认证来源写 `MANUAL`，团队人数 0。
- 权限：`IncentiveExportTest` 覆盖“非超管撤销/特批被拒”；店长越权门店由 `TrainingRecordPageTest.unauthorizedShopIsRejectedBeforeLookup` 覆盖。
- 为避免破坏演示数据，本轮未对存量记录执行作废/撤销，按钮与接口均已确认可用。

## 看板与导出（Step 8）

### 一致性核对

| 指标 | 接口 | SQL | 一致 |
| --- | --- | --- | --- |
| 考核记录总数 | `/incentive/training-assessments` total = 3 | `count(*)=3`（voided=0） | 是 |
| 通过数 | summary `passCount=3` | `sum(result=1)=3` | 是 |
| 认证数 | summary `certifiedCount=2` | `count(*)=2`（voided=0） | 是 |
| 三人 / 人工 | `teamCertifiedCount=1` / `manualCertifiedCount=1` | 如上 | 是 |
| 通过率 | `100.0%` | 3/3 | 是 |
| 平均考核次数 / 认证天数 | `3.0` / `2.0` | — | 合理 |

### 筛选

考核记录页按 门店 / 结果 / 项目 / 内训师 / 月份 / 分页 组合筛选正常；姓名搜索 + 合作状态组合已修复（见下）。

### 导出

- `GET /incentive/training-assessments/export?month=2026-11`：CSV，UTF-8 BOM，表头 `考核日期,门店,疗愈师,项目,结果,内训师,内训师门店,提交时间,备注,状态`
- `GET /incentive/training-certifications/export?month=2026-11`：CSV，认证来源输出“历史登记 / 三人认证 / 人工特批”，时间格式 `yyyy-MM-dd HH:mm:ss`
- CSV 公式注入防护：以 `= + - @` 开头的单元格前置 `'`

## 本轮发现并修复的问题

1. **姓名搜索 + 合作状态同时筛选报 500**
   - 位置：`TrainingRecordPageMapper.FILTER`
   - 原因：动态 SQL `<if>` 片段拼出 `?AND`（缺少空格），MySQL 语法错误
   - 修复：`status` 条件补前导空格，`keyword` 条件保留 `AND`
   - 回归：接口 `keyword=zzzz` → 0 条；`keyword=莎莎` → 1 条；页面输入“莎莎” → 1 行；定向单测 12 个全过

2. **导出 CSV 认证来源为英文枚举、时间带 `T`**
   - 位置：`TrainingExportService`
   - 修复：来源映射“三人认证 / 人工特批 / 历史登记”；时间统一 `yyyy-MM-dd HH:mm:ss`
   - 单测同步更新

## 回滚方式

1. 移除 `INCENTIVE_TEAM_CERT_ENABLED`（或置 false）并重启：内训师入口隐藏、`/incentive/trainer/*` 返回“内训考核功能尚未开放”，原培训矩阵只读可用。
2. 代码回滚：`/opt/fullyu-mall-test/backups/` 下保留 `mall-admin-before-kwfix-*`、`mall-admin-20261110-csvfix.jar`。
3. 数据回滚：新表与新字段保留不删；`s_massagist_training_assessment` 只增不改，旧认证数据 `source=LEGACY` 不参与三人认证统计。

## 遗留

- 测试库没有有效订单数据，考核记录页的“本月达标 / 培训奖励”显示 0，属数据缺失而非计算错误；补齐订单后需复核一次金额。
- 撤销 / 作废 / 人工特批的操作留痕（`REVOKE` / `VOID` / `MANUAL_CERTIFY` 日志）本轮未在生产演示数据上重放，已由单测覆盖。

## 生产上线

需用户单独授权，本次仅完成测试环境验收。