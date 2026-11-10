# 轻疗 × 会员中心（CRM）接入说明

> 状态：**测试环境（mall-test）已切换，真实用户导入与积分迁移完成（2026-11-08）**；生产环境未部署、开关默认关闭。
> 未配置 `CRM_ENABLED/CRM_BASE_URL` 时轻疗行为与改造前完全一致。

## 1. 这一版做了什么

| 能力 | 位置 | 说明 |
|---|---|---|
| 登录时解析 CRM 身份 | `CustomerService.login` | 登录成功后调用 `members/resolve`，CRM 不可用则登录失败，不回退本地积分 |
| 个人中心积分读 CRM | `CustomerService.getIntegration` | `/customer/getIntegration` 改为返回 CRM 余额 |
| 登录响应积分读 CRM | `CustomerService.login` | `customer.integration` 写入 CRM 余额（小程序会缓存该字段） |
| 新客 66 分改由 CRM 发放 | `CrmSyncService.ensureIdentity` | 仅当本次在 CRM 新建会员时入账，`ref=welcome:{customerId}` 幂等；同时关闭本地 66 分写入，避免两地重复 |
| 存量客户批量导入 | `POST /customer/crm/import` | 按 id 升序分批（≤500/批），逐条幂等；可选迁移本地有效积分 |
| 历史积分迁移 | 同上 `includeBalance=true` | `ref=migrate:{customerId}` 幂等；仅为本地余额 > 0 的客户入账 |
| 积分写入切 CRM（2026-11-08 第二批） | `IntegrationService` | 下单抵扣、取消/退款返还、后台单笔调整、批量导入、评价抽奖、拉新奖励统一写 CRM；本地 `s_integration` 只留影子记录与订单关联，不再作为余额来源 |
| 余额读取切 CRM | `IntegrationService.getIntegrationByCustomer*` | 会员可用余额、下单可用积分、客户详情列表全部读 CRM；本地账本仅保留给历史迁移与对账 |
| 品牌会员代理 | `com.macro.mall.crm.brand` + `BrandMemberController` | `/brandMember/me|products|game/ticket|purchase`，CRM 卡目录与愈行之旅票据；购卡已接汇付小程序支付（测试环境模拟），详见第 12 节 |

**积分记账边界（第二批后）**：

- CRM 是唯一可用余额。下单抵扣先在 CRM 读余额，按余额封顶扣减；不足返回“积分余额已变化，请刷新后重试”，不会出现“本地扣到一半”。
- 本地 `s_integration` 写一条影子记录（保留 `customer_id/order_id/comment`），用其 `id` 生成幂等键：入账 `ql-add:{rowId}`（抽奖/拉新等有稳定业务键时改用 `ql-draw:{orderId}`、`ql-referrer:{customerId}-{newCustomerId}`）、扣减 `ql-deduct:{rowId}`、退单返还 `ql-revoke:{rowId}`。
- 本地影子行不再递减 `normal_score`，因此**本地 SQL 求和不再等于可用余额**；迁移、对账请只读取 CRM 或使用 `getLocalIntegrationByCustomerId` 并明确其含义。
- 外部写入成功但本地事务回滚时，注册 `afterCompletion` 冲正（`ql-add-rollback/ql-deduct-rollback/ql-revoke-rollback:{rowId}`）；冲正失败只记 error 日志，需人工核对。
- CRM 不按自然年过期，`getInvalidIntegration` 在 CRM 模式下返回 0（“即将过期积分”不再展示本地过期口径）。

## 2. 配置

全部走环境变量，密钥不入库、不进源码：

```bash
# 留空=关闭；填 1/true 开启；填 0/false/off 强制关闭（即使填了 BASE_URL）
CRM_ENABLED=
# CRM 服务地址；非本机地址必须是 https；末位斜杠可省略
CRM_BASE_URL=https://crm-test.example.com
# CRM_EXT_KEYS 里对应的 keyId（业务键固定为 ql）
CRM_KEY_ID=ql-test
# 与 CRM 侧配置完全一致的密钥（≥16 位，不入库、不写日志）
CRM_SECRET=
# 连接/读取超时，默认 3000ms，允许 300–15000
CRM_TIMEOUT_MS=3000
```

启动校验：开启后缺 `BASE_URL / KEY_ID / SECRET`、密钥过短或非本机 http 地址都会让应用**启动失败**，不提供静默降级。

CRM 侧需要为轻疗配置业务键 `ql`：

```json
{"ql-test":{"business":"ql","secret":"<与 CRM_SECRET 相同>"}}
```

## 3. 调用契约（与 CRM 的 1C 完全一致）

- 头：`x-crm-key`、`x-crm-timestamp`（秒）、`x-crm-signature`、`Content-Type: application/json`
- 签名串：`timestamp\nMETHOD\n/api/external/...\nsha256hex(rawBody)`，HMAC-SHA256 小写十六进制，时间窗 ±300 秒
- 只传本地客户 id，不传会员号；业务身份由密钥决定
- 用到的端点：`POST members/resolve`、`GET members/:localUserId`、`POST members/import`、`POST points/earn`

错误映射（对小程序/后台都只给一句可读提示，不透出内部信息）：

| CRM 返回 | 轻疗行为 |
|---|---|
| 404 且为 `GET members/:id` | 视为未同步，调用 `resolve` 补建 |
| 409 `IDENTITY_CONFLICT` | 提示“该账号在会员中心存在需要人工合并的档案，请联系客服处理” |
| 其它非 2xx / 超时 / 连接失败 | 提示“会员服务暂时不可用，请稍后重试” |

## 4. 导入上手

1. 在测试机配置上面 5 个环境变量并重启。
2. 后台管理员登录拿到 token，先看状态：

```bash
curl -H "Authorization: Bearer <后台token>" https://<host>/customer/crm/status
```

3. 只导身份（不动积分）：

```bash
curl -X POST -H "Authorization: Bearer <后台token>" \
  "https://<host>/customer/crm/import?batchSize=500&includeBalance=false"
```

4. 确认身份无误后迁移积分（可重复执行，按 `ref` 幂等）：

```bash
curl -X POST -H "Authorization: Bearer <后台token>" \
  "https://<host>/customer/crm/import?batchSize=500&includeBalance=true"
```

返回 `submitted / created / bound / unchanged / migratedMembers / migratedPoints / failed / nextStartId`；`failed` 里带上 `localUserId` 与原因，修正后从 `nextStartId` 续跑。

导入只允许后台管理员调用（客户 token 与后台 token 共用请求头，接口内会校验主体是 `ums_admin`）。

## 5. 验证状态

| 项 | 状态 |
|---|---|
| CRM 侧契约（`ql` 业务）| **E1 通过**：真实 HMAC 冒烟覆盖导入 2 人、resolve 不重复创建、欢迎 66 分、`welcome:` 重放不重复、余额读取 66、迁移 300、`migrate:` 重放、未同步 404、错签 401、unionId/手机号冲突 409 |
| 签名算法跨语言一致 | **E1 通过**：`CrmClientSignTest` 3/3（POST/GET 固定向量与本机策略判断） |
| 轻疗编译 / 打包 | **E1 通过**（2026-11-08，本机 Amazon Corretto 11 + Maven 3.9.9）：`mall-admin -am` 编译成功，`package` 产出 Spring Boot 可执行 jar |
| 真实 Java 客户端联调 | **E1 通过**：`CrmSyncLiveSmokeTest` 用真实 `CrmClient`/`CrmSyncService` 请求本机 CRM，覆盖首次解析建档案、新客 66 分与重放、`migrate:` 300 分与重放、导入 2 人并迁移 120 分、同手机号绑定同一会员、unionId 与手机号分属两人 409；每轮自动生成唯一 id，可重复执行 |
| 真实轻疗用户导入 | **未执行**：需要 CRM 在轻疗测试环境可达并配置 `CRM_*`，再按第 4 节调用；未触碰现有数据库 |

本机复现（CRM 已按第 3 节启动）：

```bash
cd tou-mall-server
mvn -pl mall-admin -am -DskipTests=false -Dtest=CrmClientSignTest test      # 锁签名 3/3
CRM_SMOKE_BASE_URL=http://localhost:8897 \
CRM_SMOKE_KEY_ID=ql-java \
CRM_SMOKE_SECRET=... \
mvn -pl mall-admin -am -DskipTests=false -Dtest=CrmSyncLiveSmokeTest test   # 真实客户端联调
mvn -pl mall-admin -am -DskipTests package                                  # 打包
```

注意父 `pom.xml` 写死了 `<skipTests>true</skipTests>`，跑测试必须显式 `-DskipTests=false`。

测试机执行顺序：

```bash
cd tou-mall-server
mvn -pl mall-admin -am -DskipTests=false -Dtest=CrmClientSignTest test   # 先锁签名
mvn -pl mall-admin -am -DskipTests package                               # 全量编译
# 再按第 4 节做 E1：status → import(includeBalance=false) → 小程序登录看余额 → import(includeBalance=true) → 再登录
```

## 6. 回滚

把 `CRM_ENABLED` 设为 `0`（或移除 `CRM_BASE_URL`）并重启：登录、积分、导入接口全部回到本地账本；CRM 侧已导入的身份与积分保留，不删除。本地 66 分写入会恢复，**注意**：回滚后新客的本地 66 分与 CRM 已有的 welcome 分是两套账，再次开启时不会自动合并。

## 7. 已知边界

- 手机号只上传 11 位大陆号码；国际号码客户仅靠 `(ql, id)` 与 unionId 匹配。
- unionId 来自 `c_customer_wx.ma_open_id = c_customer.open_id` 关联，微信侧未同步时按无 unionId 处理，不阻断登录。
- 头像只上传以 `http(s)://` 开头的值；七牛 key 不转成预签名 URL（会过期）。
- CRM 积分过期规则尚未实现，迁移过来的余额暂不设失效时间。
- 管理后台暂无“导入 CRM”按钮，本期通过接口调用。

## 8. 品牌会员（Full愈卡）代理（本机 E1 + 测试环境 E2，2026-11-08）

小程序不直连 CRM。轻疗服务端代理由 `mall-admin` 的 `com.macro.mall.crm.brand` 包与 `controller/BrandMemberController` 组成：

- 路由：`GET /brandMember/me`、`GET /brandMember/products`、`POST /brandMember/game/ticket`、`POST /brandMember/purchase`；已在 `application.yml` 安全白名单登记，顾客身份取 Session 当前客户，接口不接受前端传 `localUserId`。
- 签名：与服务端 1C `X-Fy-*` 契约一致（timestamp + nonce + method + 完整路径 + body 哈希的 HMAC-SHA256）；`me` 固定带 `business=retreat`，`localUserId` 为当前客户 ID。每次请求新 nonce，超时默认 3000ms（可钳制 300–15000）。
- 配置：`BRAND_CRM_ENABLED`、`BRAND_CRM_BASE_URL`（回退 `CRM_BASE_URL`）、`BRAND_CRM_KEY_ID`、`BRAND_CRM_SECRET`、`BRAND_CRM_TIMEOUT_MS`。生产环境强制 HTTPS（回环地址除外），密钥 ≥16 位，只走环境变量，不入库、不写日志；未配置时返回“品牌会员服务尚未开启”，不会发请求。
- 支付：`purchase` 已改为「建支付单 + 汇付小程序支付」，只有验签回调成功才开卡，报价金额以 CRM 返回为准；测试环境走模拟支付，不产生真实扣款（第 12 节）。
- 错误映射：无档案重试提示、无有效卡不可进游戏、报价过期/金额不符分别返回 409 语义，CRM 500/网络异常统一“会员服务暂时不可用”，不向上游泄漏内部错误。

验证（本机 E1）：`BrandMemberClientTest` 5/5（含跨语言固定签名、配置校验、报价请求体不含价格、错误不泄漏）、`BrandMemberControllerTest` 3/3（必须登录、使用服务端身份、purchase 不调用开卡）；`mvn -pl mall-admin -am -DskipTests package` 通过。

测试环境 E2（2026-11-08）：新 jar `mall-admin-1.0-SNAPSHOT.jar` 与 H5 已替换并重启；`https://mall-test.fullyu.cn/api/brandMember/products` 返回 200 且产品数据来自 CRM（`FY_MONTH` / `FY_ANNUAL`），`/brandMember/me` 未登录返回“请先登录”。H5 首次部署误用了不完整的 10KB uni-app 构建，已回滚到 `web-20261108-before-brand.tgz`，再用 HBuilderX 内置 Node 重建（1.8MB，含 `pages-user-brand-member-*` chunk）并以 `/api` 基地址部署；浏览器实测首页与 `#/pages/user/brand-member/brand-member` 均可打开，品牌页请求命中 `https://mall-test.fullyu.cn/api/brandMember/*`。`BRAND_CRM_*` 只写 `/opt/fullyu-mall-test/crm.env`，密钥未落仓库/日志。小程序 `mp-weixin` 已上传开发版 `1.0.8`（1002.2 KB，appid `wxeb4e8a99b7eeebf8`）；体验版切换与提审待公众平台操作。

## 9. 测试环境切换与真实导入（mall-test，2026-11-08）

拓扑：

- CRM 服务部署在在场服务器 `47.111.136.49`，systemd 单元 `fullyu-crm`，只监听私网 `172.19.180.137:8898`，公网不可达；数据 `/opt/fullyu-crm/data/crm.db`，配置 `/etc/fullyu-crm/crm.env`（600）。
- 轻疗测试域名 `https://mall-test.fullyu.cn/crm-api/` → nginx `location ^~ /crm-api/`（去掉前缀）→ `127.0.0.1:8899` → 受限 SSH 隧道 `crm-tunnel.service`（密钥只允许转发到 CRM 8898）→ CRM。签名路径保持 `/api/external/...`，与 1C 契约一致。
- 轻疗后端 19929：`start-backend.sh` 启动前 source `/opt/fullyu-mall-test/crm.env`（600，含 `CRM_ENABLED/CRM_BASE_URL/CRM_KEY_ID/CRM_SECRET/CRM_TIMEOUT_MS=5000`），密钥不出现在命令行与日志中。

结果（测试环境实测，非 E1 本地）：

| 项 | 结果 |
|---|---|
| `/customer/crm/status` | `enabled=true`、`baseUrl=https://mall-test.fullyu.cn/crm-api` |
| 客户导入 | 9904 名客户全部导入，0 失败；CRM 侧 ql 身份 9905 条、去重后 9862 个会员（created 9362 / bound 42 同手机号 / unchanged 1） |
| 本地有效积分（type=ADD、state=EFFECTIVE、未过期） | 1601 行 / 78334 分 / 1253 人 |
| 积分迁移 | 迁移 1253 人 / 78334 分，0 失败；CRM 抽检 `8928=346`、`6847=201`、`7018=165`，与本地 SQL 完全一致 |
| 幂等 | 重放导入批次后 CRM 流水仍 1255 行（2 条 seed + 1253 条 migrate），未重复入账 |
| 登录闭环 | 合成手机号新客 customer `1023572620283`：首次登录 `balance=66`（CRM `welcome:{id}`），二次登录仍 66，`/customer/getIntegration` 返回 66 |

运维注意：

- 导入接口必须后台管理员 token；`batchSize` 建议 ≤100。500 一批时 CRM 处理超过客户端 5s 超时，接口会报“会员服务暂时不可用”，但 CRM 侧通常会完成，重跑因 `ref` 幂等不会重复。
- 备份：`/opt/fullyu-mall-test/backup/crm-switch-20261108-120754/`（切换前 jar、`application.yml`、`CustomerService`、`CustomerWxMapper`、`start-backend.sh`）；CRM 库快照 `data/crm.db.bak-*`。
- 回滚：`crm.env` 中把 `CRM_ENABLED` 改为 `0` 并重启后端，即回到本地账本；CRM 侧数据保留。

已知限制：

- 身份导入 CRM 只在轻疗开启；时叙、在场的身份仍走各自系统。
- 品牌会员代理已随 2026-11-08 测试环境部署（第 8 节）；汇付小程序支付已接入（第 12 节），测试环境走模拟支付，不发真实扣款。
- 小程序开发版已上传至 `1.0.10`；体验版切换、真机闭环与提审仍需公众平台/真机操作。

## 10. 积分写入切换（mall-test，2026-11-08 第二批）

部署：本地构建 `mall-admin-1.0-SNAPSHOT.jar`（含 CRM 身份/积分 + 品牌会员代理），上传覆盖后重启 19929。切换前 jar 与 `crm.env` 备份在 `/opt/fullyu-mall-test/backup/points-cutover-20261108-1235/`。

代码要点：

- `CrmClient.consume`：`POST /api/external/points/consume`；422 映射为“积分余额不足”（不再误报 503），400/409 同样返回可读业务文案；网络异常或读超时用同一请求体重试一次，依赖 CRM 的 `ref` 幂等。
- `IntegrationService`：CRM 开启时 `useIntegration` 按 CRM 余额封顶并写影子行；`revocationIntegration` 按影子行 `id` 返还；`addIntegrationBatch` 落影子行后逐条入账，失败冲回已入账行并删除本地行；`getIntegrationByCustomer*` 读 CRM，新增 `getLocalIntegrationByCustomer*` 仅给迁移/对账。
- 补偿：写成功后才登记 `afterCompletion`，本地事务最终回滚时用反向 ref 冲正；写失败不登记，避免误冲正。
- 测试：`CrmPointsWriteTest` 10 项（封顶、422、影子行清理、稳定 ref、返还幂等、余额读取），`IntegrationOperationTest` 9 项，`CrmClientSignTest` 3 项，共 22 项通过；`CrmSyncLiveSmokeTest` 补充真实 CRM 的扣减/重复 ref/422/返还（需显式环境变量，默认跳过）。

端到端证据（真实测试环境，合成客户 `1023572620284` / 手机号 `19900000001` / CRM 会员 `FY-2611-009864`）：

| 步骤 | 操作 | CRM 余额 | 本地影子记录 |
|---|---|---|---|
| 1 | 首次后台调增 +50（新身份自动 +66 新客） | 116 | `s_integration` 新增 1 行（+50，无 order_id） |
| 2 | 后台调减 -20 | 96 | 新增 SUBTRACT 20（id 4495） |
| 3 | 再次调减 -20 | 76 | 新增 SUBTRACT 20（id 4496） |
| 4 | 调减 -80 | 76（未变） | 未写；返回“积分不足，当前可用 76 分，需扣减 80 分” |
| 5 | 调减 -20 并关联合成订单 `1023572620296` | 56 | SUBTRACT 20（id 4497，order_id=1023572620296） |
| 6 | 后台取消该订单（`/order/cancel/order`） | **76** | 4497 state=0，comment=“订单已取消或退款”；订单 state=4 |
| 7 | 重复取消同一订单 | 76（未变） | 状态校验拒绝，未再返还 |

未验证/边界：

- 真实微信支付取消链路（汇付退款）未触发；本轮用“积分订单后台取消”覆盖同一 `revocationIntegration` 分支。
- 进程在“CRM 写入成功、本地提交前崩溃”的窗口内，本地影子行与 CRM 可能短暂不一致；补偿只在正常事务回滚时触发，崩溃窗口需按 `ref` 人工对账。
- 批量导入文件的逐行 CRM 失败会整批中止并冲回已入账行；不会留下“本地有、CRM 没有”的积分。

## 11. 品牌会员代理（mall-test，2026-11-08）

轻疗端品牌会员（Full愈年卡/月卡、愈行之旅）只做登录身份代理，卡期、积分与游戏账本都在 CRM：

| 项 | 状态 |
|---|---|
| 代码 | `crm/brand/BrandMemberProperties` + `crm/brand/BrandMemberClient` + `controller/BrandMemberController`；运行 jar 已包含 |
| 路由 | `/brandMember/{me,products,game/ticket,purchase}`；公网入口 `https://mall-test.fullyu.cn/api/brandMember/*` |
| 配置 | `/opt/fullyu-mall-test/crm.env` 的 `BRAND_CRM_ENABLED=1` / `BRAND_CRM_BASE_URL=https://mall-test.fullyu.cn/crm-api` / `BRAND_CRM_KEY_ID` / `BRAND_CRM_SECRET`（600，密钥未打印） |
| 实测 | `GET /api/brandMember/products` → `200`，返回 CRM 定价 `FY_MONTH`（¥45/30 天）与 `FY_ANNUAL`；未登录 `GET /brandMember/me`、`POST /brandMember/purchase` → “请先登录”（HTTP 200 + body `code:500`，异常被全局包装，业务码不可依赖） |
| 单元测试 | `BrandMemberClientTest` 5 + `BrandMemberControllerTest` 3，**8/8 通过**（Maven，Corretto 11） |
| 支付 | `POST /brandMember/purchase` 现为“创建品牌卡支付单 + 发起汇付小程序支付”；开卡只在汇付签名回调校验通过后执行。测试环境（`-Dfullyu.test-mode=true`）不调汇付，下单返回 `testMode=true`，由 `/brandMember/purchase/mock` 模拟结算。详见第 12 节 |

未验证：真实微信登录后的 `/brandMember/me` 与 `game/ticket` 全链路（需小程序真机）；时叙与在场同批代理已在各自环境复核，详见 CRM README「第三批收尾」。

## 12. 品牌会员卡汇付小程序支付（2026-11-08）

轻疗品牌会员卡（Full愈年卡 / 月卡）从「仅代理登录」升级为真实收款：下单 → 汇付小程序支付 → 签名回调 → CRM 开卡 + 本地权益期；退款按 7 天全额 / 超期倒扣，并撤销 CRM 卡权。金额只认服务端：价格来自 CRM 报价，前端不传价。

### 12.1 收款主体

- 品牌卡支付单不落门店 `shopId`，`PayService.generatePay` 的商户分支落到 `doInit1` / `PayCert.sysId1`，即**总公司账户**；门店 1/8 的历史商户号不受影响。
- 渠道固定 `WX_MINI`（汇付事件 `pay.wx_lite`），回调沿用 `/admin/open/dgpay/callback`，`DgPaySignUtils.verifySign` 验签通过后才进入业务。

### 12.2 下单与开卡

| 端点 | 行为 |
|---|---|
| `POST /brandMember/purchase` | 校验登录 / 未锁定 / 已勾选条款 → CRM `quote` 取 `priceCents` 与 30 分钟 `quoteId` → 落 `c_member_card_order`（`STATE_UNPAID`，`idempotency_key=brand-card:issue:{orderSn}`）→ `PayService.generatePay` 返回小程序 `payParams`。测试环境直接返回 `testMode=true`，不调汇付 |
| `POST /brandMember/purchase/mock` | 仅测试环境可用（否则 403）；按订单金额走同一结算流程，流水记 `MOCK-*` |
| `GET /brandMember/order?orderSn=` | 支付单状态（0 待支付 / 1 已支付 / 2 已关闭 / 3 已退款 / 4 已支付待开卡） |
| `GET /brandMember/orders` | 本人最近 10 单 + 锁定状态 / 原因，含服务端退款试算 |

回调结算（`BrandCardPaymentService.handlePayCallback`）：

- 按 `mer_ord_id` 定位 C 开头订单；已支付直接返回，已退款/已关闭拒绝开卡，回调可安全重放。
- 回调金额与订单 `paid_cents` 不一致时**不自动开卡**，写 `pay_error` 并保留人工核对；不提供“重试开卡”。
- CRM 开卡用幂等键 `brand-card:issue:{orderSn}`；报价过期先重新报价，价格未变才继续，变了返回 409 提示人工补差/退款。
- 开卡成功同时写本地 `c_customer_member_card` 权益期与 `crm_card_id`；CRM 暂时不可用则整笔事务回滚，订单停在待支付/待开卡，汇付可重试回调。

### 12.3 退款与防薅羊毛

| 规则 | 实现 |
|---|---|
| 金额来源 | **唯一来源是 CRM `refund-quote`**（2026-11-09 会议后改）：轻疗不再本地算可退金额；CRM 不可用返回 503「暂时无法试算」，不回退本地口径 |
| 7 天内 | `实付 − 已领年卡礼价值`，`refund_type=WITHIN_7D` |
| 超过 7 天 | `实付 − 已享会员优惠 − 已领年卡礼价值`，`refund_type=AFTER_7D`（库内旧值 `PRORATED` 视为同义历史口径）；已享优惠含会员价差额、积分抵扣、赠品与活动优惠 |
| 可退金额 ≤ 0 | `allowed=false`，**不可退款**（不再有 `confirmZero` 二次确认），小程序与后台只显示原因 |
| 优惠未同步 | 本地有该卡消费但 CRM 尚未汇总已省金额时 `reasonCode=SAVINGS_SYNC_PENDING`，暂停自助退款，提示联系工作人员，防止少扣 |
| 赠送 / 附赠资格 | 会员码兑换、在场畅练卡附赠的品牌会员资格未单独付款，不涉及退款 |
| 退款执行 | 测试环境记 `MOCK-REFUND-*`；正式环境调 `payService.refundPay` 原路退回，失败返回 503 不落退款成功 |
| CRM 卡权 | 退款后调 CRM `refund`（幂等键 `brand-card:refund:{orderSn}`）；失败保留 `PENDING_CRM`，每 10 分钟由 `MemberCardScheduled` 补偿，后台也可手动“重试撤销” |
| 防薅羊毛 | 客户本人连续 2 笔 `WITHIN_7D` 自助退款（后台代退不计）→ `c_customer.brand_card_locked=1`，写原因与时间；锁定后下单返回 403，需后台解锁 |

端点：`GET /brandMember/refund/preview`、`POST /brandMember/refund {orderSn, reason}`（预览返回 `paidCents/savedCents/redeemedGiftCents/refundCents/within7Days/allowed/reasonCode/deadline/policy`，`needConfirm` 恒为 false）；后台 `GET /memberCard/brandOrder/page|preview`、`POST /memberCard/brandOrder/refund`、`retrySettle`、`retry`、`POST /memberCard/customer/unlock {customerId}`。

### 12.4 后台「品牌卡支付单」

- 位置：客户管理 → 会员卡 → 第二个页签「品牌卡支付单」；筛选支持手机号/昵称、订单状态、退款状态（未退款 / 待撤销 CRM 卡 / 已退款）、产品、下单日期。
- 列宽已压缩到 1194px，1280 / 1440 宽度均无横向滚动（1280 内容区 1195、1440 内容区 1211）；长订单号、客户昵称、CRM 卡号省略并带 tooltip。
- 行内操作：退款（先弹窗试算实付 / 已享优惠 / 应退与 7 天截止）、重试开卡（仅状态 4）、重试撤销（仅 `PENDING_CRM`）；客户列显示「已锁定」标记。
- 试算不可退（≤0、优惠未同步、CRM 不可用）时弹窗只显示原因、提交按钮禁用；已移除“金额为 0 勾选确认”。后台代退不触发防薅羊毛锁。

### 12.5 测试环境验收（mall-test，2026-11-08）

| 项 | 结果 |
|---|---|
| 数据库迁移 | `sql/2026-11-08-brand-card-payment.sql`（幂等 ALTER）仅应用到 `tou_mall_test`，未触碰生产库 |
| 构建 / 部署 | `mall-admin-1.0-SNAPSHOT.jar` 已替换并重启 19929；后台 `admin-dist` 已发布到 `/mall-admin/`，备份 `admin-dist.bak-20261108-221343` |
| 支付闭环 | 测试模式 `-Dfullyu.test-mode=true`：下单不调汇付，模拟支付后订单转 1、CRM 开卡、本地权益期生成；样例单 `C202611082206359052` 为 ¥0.02（CRM 共享测试产品被他人改成 2 分/365 天，属外部数据漂移，不是代码定价） |
| 退款试算 / 弹窗 | 后台退款弹窗 520×478.6、居中，显示实付 / 已享优惠 / 应退 / 7 天截止；金额为 0 时勾选确认后才可提交 |
| 解锁 | 对客户 `1023572620288` 造锁后调用解锁：`200`，库内 `brand_card_locked=0`、原因与时间清空（`updateById` 会忽略 null，已改为显式 set null） |
| 后台布局 | 1280 / 1440 截图实测无横向滚动，支付时间单行，手机号完整 |
| 小程序 | `mp-weixin` 以 HBuilderX 内置 Node 正确构建（1.8M，含 `pages/user/brand-member/*`），已上传开发版 `1.0.10`（1,055,556 B，appid `wxeb4e8a99b7eeebf8`）；支付、订单记录、退款弹窗入口随包 |
| 隔离支付演练 | `/tmp/pay-e2e-drill.sh` 覆盖正向购买、重复下单/重复支付幂等、4 种退款、防薅锁/解锁、异常单人工退款、越权与非法参数：**67 项全过**；修审计缺口的 jar 部署后二次演练仍 **67/0** |
| CRM 撤销补偿 | 共享 CRM 已同步 `refund` 编译产物与 Prisma refund 字段（`db push` + client）；直连签名退款 201 `REFUNDED`；3 笔历史 `PENDING_CRM` 由 23:00 定时任务全部转 `SUCCESS`，日志「CRM 撤销补偿完成，成功 3 条」 |
| 操作审计 | 客户购买/模拟支付/自助退卡写入 `t_controller_log`，`source=APP`、`create_user=客户id`；后台退款 `source=PC`、`create_user=管理员id`；修复后无「保存日志失败」 |

### 12.6 未验证 / 上线前必须确认

- **真实汇付扣款已在测试环境小额验证一次（2026-11-09，单独授权）**：以 `start-backend-realpay.sh` 非 test-mode 启动，开发者本人扫码真实付 ¥0.01；`pay.wx_lite` 回调验签、CRM 开卡、本地权益期均成功，随后真实退款到账（订单 `state=3`、`refund_state=SUCCESS`、本地卡 `status=3`）。演练后已切回 `-Dfullyu.test-mode=true`；生产商户号、回调域名与提审仍需上线前单独确认。
- **滚动资金边界**：退款先调渠道、后落本地事务；若渠道成功而本地事务异常回滚，会出现“钱已退、单仍 PAID”的短窗口，需人工对账。跨系统无分布式事务，保留流水号供核对。
- 共享 CRM 的品牌卡产品价格/有效期被其他作业方改过（当前 2 分 / 365 天），验收金额应以 CRM 当前配置为准；不要据此判断代码定价。
- 生产发布需单独确认：迁移脚本、`PayCert` 商户配置、回调域名白名单、汇付后台事件订阅、小程序体验版/正式版切换。
- H5 未随本轮重新构建（会员卡支付主要在小程序），后台页面已更新；如 H5 也要展示支付单，需重新构建部署。

## 13. 续费口径与订单页整合（mall-test，2026-11-09）

用户实测「点续费报已开通/请勿重复购买」后，修正防重口径并合并购卡记录：

- **续费合法**：购买侧只拦 60 秒内同款未支付单（409「支付单正在创建，请稍后重试」）；已支付过的同款卡不再拦截，由 CRM 把新卡期接在原卡期之后。
- **并发重复判定**：仅当另一笔同款 `state=1` 的 `pay_time` **严格大于**本单 `create_time` 才判重复（`PAID_PENDING` + 人工退款）。`>=` 会误杀正常续费，因为 `create_time/pay_time` 是秒精度 `datetime`，续费与上一笔支付常落在同一秒。
- **实测**：同秒续费两单均 `state=1`；62 秒后续费 `state=1`；两笔并行未支付单仍识别为重复并人工关闭。
- **订单页**：轻疗订单第 4 个 tab 改名「卡券与会员」，会员卡单与卡券单合并按时间倒序；该 tab 的 `appointmentState` 必须为空，且切换后重算 `total`。会员页只留入口，不再铺长列表。
- **开卡档案**：开通/续费先填称呼（必填）、性别（必选）、生日（必填，不晚于今天），确认后才创建支付单；档案行的「修改」只保存并提示「会员档案已保存」，不发起支付。
- **小程序 1.0.12**：开发版已上传（1,090,502 B，appid `wxeb4e8a99b7eeebf8`，含档案修改不支付的修复）。构建用 `cli launch mp-weixin --compile true` 出 dev 包；上传前复制到 ASCII 路径并**不要带 `-i/--info-output`**（否则报二维码路径 code 17）。体验版切换仍需公众平台手动操作。
- **游戏真机**：票→web-view→H5 已实测可玩；真机需在公众平台业务域名加入 `mall-test.fullyu.cn`，否则 web-view 打不开（开发者工具可关域名校验绕过）。

## 14. 年度大会员会议整改（2026-11-09，本机 E1，未部署）

依据 2026-11-08 会议逐字稿（菲菲 Fiona × Full愈）调整，规则口径以 CRM 为唯一来源，轻疗只代理与展示。

### 14.1 订单上报（骰子与已享优惠的数据来源）

- `BrandOrderReporter` 每分钟第 30 秒扫最近 7 天、有顾客、实付 > 0 的已付款 / 退款中 / 已退款 / 审批中订单，按 `orderRef` 幂等上报 CRM `brand-member/orders/report`；退款按**累计**金额上报 `orders/refund`，重启重放不会多发骰子。
- 只计真实收款：扫码（0）、微信（1）、现金（4）。卡券核销（payType=2）购卡时已计，不重复；美团（payType=3）是否计入待经营确认，暂不上报。
- CRM 尚无该顾客档案时退避 60 分钟；任一失败不记指纹，CRM 不可用时整批停下。
- 开关：`brand-crm.order-report-enabled`（环境变量 `BRAND_ORDER_REPORT_ENABLED`，`1/true/on/yes` 开启），**默认关闭**。开卖品牌卡前必须打开，否则 7 天后的退卡试算拿不到轻疗侧的已享优惠，CRM 会返回 `SAVINGS_SYNC_PENDING` 阻止自助退款。

### 14.2 新增代理端点（小程序）

| 端点 | 用途 |
|---|---|
| `POST /brandMember/gift/claim {code}` | 兑换会员码（渠道 / 推荐人 / 天数默认 30 / 名额 / 截止日由 CRM 配置；名额满返回“已满”；> 30 天需 CRM 审批后生效） |
| `POST /brandMember/feedback {content, allowStory}` | 有效会员提交意见反馈，可勾选同意匿名（只留姓氏）整理进会员故事 |
| `GET /brandMember/stories` | 会员故事，仅有效会员可见 |

三者均要求登录，错误按 CRM `{error, message}` 原样透传给小程序。

### 14.3 小程序会员页 / 订单页

- **骰子进度**：显示 CRM `dice.progress`，文案「再消费 ¥X 可再得一次游戏机会」；推荐顺序轻疗（建议提前一天预约）→ 在场 → 时叙。门槛缺失或非正数时不渲染，避免 NaN。
- **体验券**：游戏奖品仅为免费体验券，显示券码与使用状态；轻疗体验券在累计 10 颗骰子后才进入奖池（CRM 控制）。实物礼改为到店领取码。
- **续费**：卡期进入 `EXPIRING` 时显示「本期已为你节省 ¥X」与续费按钮；时叙权益暂写「会员茶饮权益，以门店公示为准」，具体内容待定。
- **会员码 / 意见反馈 / 会员故事**：会员页新增三块，反馈 5–1000 字（与 CRM、时叙同一上限；轻疗后端原写 500 字会误拒 501–1000 字，已修正并补边界测试）。
- **退款弹窗**：打开时重新调 CRM 试算（不用列表缓存），分项显示实付 / 已享优惠（仅超过 7 天）/ 已领年卡礼 / 可退；不可退时只显示原因并禁用提交。
- **规则页**：`pages/user/brand-member/rules.vue` 第四、五节与时叙法务页同口径，新增第六节「会员码、会员故事与意见反馈」。

### 14.4 验证状态

- 后端单测：`BrandOrderReporterTest` 8/8、`BrandMemberControllerTest` 7/7、`BrandCardPaymentServiceTest` 36/36、`BrandMemberClientTest` 9/9（同批共 60 项全过）。`createOrderBlocksDuplicateWithinAntiDoublePayWindow` 原断言的是旧口径“30 秒内刚支付同款即拦截”，与 §13 已确认的“续费合法、只拦 60 秒内同款未支付单”冲突，已按新口径改为断言 409「支付单正在创建」。
- 小程序：`node --test tests/` 48/48；`brand-member.vue`、`order.vue` SFC 编译 0 错误；`mp-weixin` 构建成功，**未上传**。
- 未部署 mall-test，未写生产数据，未提交代码；`sql/2026-11-08-brand-card-payment.sql` 与 `MemberCardOrder` 仅更新 `refund_type` 注释，无 schema 变更。
