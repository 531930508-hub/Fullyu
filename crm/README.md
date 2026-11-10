# Full愈 CRM 中台（服务端 + 管理后台）

会员与积分的唯一账本，独立于三端业务系统运行。当前为**一期第一批 + 1B + 1C + 1D + 1E + 1F**：登录与权限、会员查询/档案/资料修改、积分批次与流水、单笔/批量调整与第二人审批、只追加审计；大会员卡产品与不可变版本、业务会员卡目录；三端签名接口（身份解析/批量导入/积分入账与扣减、品牌会员身份/产品/报价/开卡、愈行之旅骰子与礼物）；规则版本、月度对账、outbox/webhook/异常队列、角色权限在线调整；同源零构建管理后台；三端服务端品牌会员代理。

**边界**：已在测试环境部署（SQLite、合成/迁移数据），不是生产上线；真实支付仍未接入，三端购卡统一返回“支付通道尚未接入”。构建、测试通过不等于生产批准；生产部署、真实扣款与小程序发布仍需分别授权。

## 环境与命令

Node ≥ 20（用到 `process.loadEnvFile`），pnpm ≥ 8。

```bash
pnpm install
cp apps/server/.env.example apps/server/.env   # 本地开发；已存在的环境变量优先
pnpm --filter @fullyu/crm-server db:generate
pnpm db:push                                   # 建 SQLite 开发库
pnpm db:seed                                   # 4 角色 / 4 账号 / 3 位合成会员
pnpm test                                      # Jest + supertest，独立临时库
pnpm lint
pnpm build:server                              # 先编 shared，再编 server
pnpm dev:server                                # 先编 shared，再 tsx watch
```

生产启动：`node apps/server/dist/main.js`（先 `pnpm build`）。生产必须显式设置 32 位以上、非示例值的 `JWT_SECRET`，否则拒绝启动。

管理后台与 API 同源：启动后打开 `http://localhost:3000/admin/`（`/` 会重定向）。后台是 `apps/admin/public` 下的零构建静态页，无需单独开发服务器或构建步骤；所有权限仍由服务端逐请求校验，前端隐藏导航只是体验优化。静态文件使用 `Cache-Control: no-cache`，发布后不会沿用旧脚本。

### 合成账号（仅本地/测试）

| 账号（登录名） | 姓名 | 角色 | 可用能力 |
|---|---|---|---|
| 13800001001 | 周岚 | CRM 管理员 | 全部 |
| 13800001002 | 李沐 | 会员运营 | 会员、发起单笔/批量、查看与维护大会员卡、审计 |
| 13800001003 | 王宁 | 财务 | 查看、审批、查看大会员卡目录、审计 |
| 13800001004 | 赵一 | 客服 | 查看、发起单笔、查看大会员卡目录 |

密码由 `SEED_PASSWORD` 注入；本地未设置时使用种子脚本内置的开发默认值。这些账号、手机号与会员均为合成数据，不得用于任何真实环境。

## 目录

| 路径 | 职责 |
|---|---|
| `packages/shared/src/index.ts` | 业务枚举与对外键映射、14 个权限点、四角色模板、500 分免审阈值、积分为期 |
| `apps/server/prisma/schema.prisma` | 员工与角色、会员与身份、积分批次/流水、调整单、审计、幂等键、大会员卡产品/版本、会员卡期/报价、nonce、游戏状态/票据/骰子账本/礼物、规则版本、outbox、业务同步状态 |
| `apps/server/prisma/seed.ts` | 合成账号与会员；年卡/月卡；林小满生效年卡与骰子；积分与骰子 CURRENT 规则；`SEED_PASSWORD` 仅用于本地/测试 |
| `apps/server/src/auth` | 登录（bcrypt + JWT）、`/auth/me`、员工守卫、权限守卫 |
| `apps/server/src/members` | 列表检索、档案（含明文手机号、品牌卡与骰子摘要）、资料修改（乐观锁） |
| `apps/server/src/points` | 账本（批次/流水）、单笔与批量调整、审批状态机 |
| `apps/server/src/cards` | 大会员卡产品/版本状态机、业务会员卡目录（只读归属不可改） |
| `apps/server/src/game` | 愈行之旅：骰子领取/退款、掷骰与礼物、规则版本（未来生效、撤销） |
| `apps/server/src/reports` | 月度对账：年卡售卖/退款、积分发行/消耗、骰子发放/消耗，只出事实数据 |
| `apps/server/src/sync` | outbox 投递、HMAC webhook、重试退避、同步滞后、异常队列 |
| `apps/server/src/roles` | 角色权限读取与在线调整；CRM 管理员受保护 |
| `apps/server/src/audit` | 审计查询（`crm:audit:view`） |
| `apps/server/src/external` | 三端身份/积分签名接口（`x-crm-*`）：身份解析、批量导入、积分入账/扣减 |
| `apps/server/src/brand-member` | 三端品牌会员契约（`X-Fy-*`）：身份页、产品目录、报价/开卡、游戏票据；nonce 防重放 |
| `apps/admin/public` | 零构建管理后台：概览、会员、调整、卡、规则、礼物、同步、队列、对账、审计、角色 |
| `apps/server/src/common` | 错误语义、异常过滤器、Prisma、幂等、审计写入 |
| `apps/server/src/testing/harness.ts` | 集成测试脚手架：复制模板库、起 Nest、发请求 |
| `apps/server/src/crm.spec.ts` | 会员/积分/审计集成用例（含品牌卡与骰子摘要） |
| `apps/server/src/cards/cards.spec.ts` | 大会员卡版本与业务卡目录 |
| `apps/server/src/external/external.spec.ts` | 签名负向、身份合并冲突、幂等与不变量 |
| `apps/server/src/brand-member/brand-member.spec.ts` | X-Fy 签名/nonce、卡期、报价开卡、续费、票据 |
| `apps/server/src/game/game.spec.ts` | 规则版本、骰子领取/封顶/退款、掷骰/礼物交付、权限 |
| `apps/server/src/reports/reports.spec.ts` | 月度事实报表、跨月与权限 |
| `apps/server/src/sync/sync.spec.ts` | outbox、HMAC 投递、失败重试与权限 |
| `apps/server/src/roles/roles.spec.ts` | 内置角色保护、非法权限、即时生效与审计 |

## 接口（前缀 `/api`）

| 方法与路径 | 权限 | 说明 |
|---|---|---|
| `GET /health` | 公开 | `{status:'ok',service:'crm'}` |
| `POST /auth/login` | 公开 | 账号为手机号；返回 token（12h）、资料与权限 |
| `GET /auth/me` | 登录 | 当前员工与权限 |
| `GET /members?q=&business=&page=` | `crm:member:view` | 姓名/手机号/会员号检索；余额由批次实时汇总 |
| `GET /members/:id` | `crm:member:view` | 档案、身份、批次、最近流水、品牌卡与骰子/礼物摘要；同一操作人每天只记一次查看审计 |
| `PATCH /members/:id/profile` | `crm:member:edit` | `baseVersion` 不匹配返回 409；成功版本 +1 |
| `POST /adjustments` | `crm:adjust:create` | 单笔；≤500 直接入账，>500 待审批；支持 `Idempotency-Key` |
| `POST /adjustments/batch` | `crm:adjust:batch` | ≤50 行、会员不重复，一律待审批 |
| `GET /adjustments?status=` | 发起或审批权限 | — |
| `GET /adjustments/:id` | 发起或审批权限 | — |
| `POST /adjustments/:id/approve` | `crm:adjust:approve` | 审批时整单复核，任一失败整单不执行 |
| `POST /adjustments/:id/reject` | `crm:adjust:approve` | 意见 ≥2 字 |
| `GET /audit?action=&actor=&q=` | `crm:audit:view` | 只追加 |
| `GET /brand-cards` | `crm:card:view` | 产品列表 + 当前生效版本 + 全部版本 |
| `GET /brand-cards/:code` | `crm:card:view` | 单产品详情 |
| `POST /brand-cards` | `crm:card:edit` | 新建产品；编码须形如 `FY_ANNUAL` |
| `POST /brand-cards/:code/versions` | `crm:card:edit` | 新建草稿版本；价格、天数、权益、积分模式校验 |
| `POST /brand-cards/:code/versions/:version/activate` | `crm:card:edit` | 激活草稿；旧生效版本归档；不可重复激活 |
| `GET /business-cards?business=` | `crm:card:view` | 业务自有卡目录；同时返回内部键与对外键 |
| `PATCH /business-cards/:business/:cardCode` | `crm:card:edit` | 仅改名称/权益/说明/管理路径/状态/排序 |
| `GET /rules` | `crm:config:edit` | 积分（按业务）与骰子规则版本；到期版本自动切换 |
| `POST /rules/:key/versions` | `crm:config:edit` | 新建待生效版本；生效日必须晚于今天，同规则仅一个待生效 |
| `POST /rules/:key/versions/:version/cancel` | `crm:config:edit` | 仅可撤销待生效版本 |
| `GET /game/prizes?status=` | `crm:member:view` | 礼物列表（含会员号/姓名） |
| `POST /game/prizes/:id/collect` | `crm:member:edit` | 人工交付；重复/过期 409，写审计 |
| `GET /sync/status` | `crm:sync:view` | 三端最近调用、滞后、webhook、待投递/失败/快照 |
| `GET /sync/events?status=&business=&limit=` | `crm:sync:view` | outbox 事件 |
| `POST /sync/run` | `crm:sync:retry` | 立即投递到期事件 |
| `POST /sync/events/:id/retry` | `crm:sync:retry` | 重置为待投递 |
| `GET /queue` | `crm:queue:handle` | 投递失败与过期报价 |
| `POST /queue/:id/retry` | `crm:queue:handle` | 异常队列重投 |
| `GET /reports/monthly?month=YYYY-MM` | `crm:report:view` | 月度事实数据，不生成结算凭证 |
| `GET /roles` | `crm:role:edit` | 四角色与权限点 |
| `PATCH /roles/:id` | `crm:role:edit` | 在线改权限；CRM 管理员受保护，下一请求即生效 |

## 三端签名接口（1C）

### 身份与积分（`x-crm-*`）

业务端不传会员号，只传自己的本地用户 id。所有请求带 `x-crm-key`、`x-crm-timestamp`、`x-crm-signature`。

签名串：`timestamp\nMETHOD\n/api/...（含查询串）\nsha256hex(rawBody)`，secret 做 HMAC-SHA256；时间窗 ±300 秒。密钥由 `CRM_EXT_KEYS` 注入，形如 `{"ql-test":{"business":"ql","secret":"..."}}`，不入库。

| 方法与路径 | 说明 |
|---|---|
| `POST /external/members/resolve` | 按本地用户 id + unionId + 手机号解析/创建；返回会员号与余额 |
| `GET /external/members/:localUserId` | 查本业务用户 |
| `POST /external/members/import` | ≤500 条批量导入，逐条幂等，返回新建/绑定/已存在/失败 |
| `POST /external/points/earn` | 加分，`points>0`，带 `reason` 与 `ref` |
| `POST /external/points/consume` | 扣分，余额不足 422，按到期最早优先 |

身份匹配：本业务身份 → unionId（存在身份上）→ 手机号；unionId 与手机号命中不同会员时 409 `IDENTITY_CONFLICT`，不自动合并；外部只补空缺资料，不覆盖 CRM 已有值。

### 品牌会员契约（`X-Fy-*`）

三端用 `X-Fy-Key`、`X-Fy-Timestamp`、`X-Fy-Nonce`、`X-Fy-Signature`、`Idempotency-Key` 调用。签名串：

```
timestamp\nnonce\nMETHOD\n/api/v1/brand-member/...（含查询串）\nsha256hex(rawBody)
```

时间窗 ±300 秒；nonce 8–128 位、10 分钟防重放，同 key + nonce 再请求返回 409 `REPLAYED`。业务键只收发 `teahour / retreat / presence`；密钥与业务绑定，跨业务读取返回 403 `BUSINESS_MISMATCH`。会员身份只接受本业务 `localUserId`，不接受手机号或会员号。

| 方法与路径 | 说明 |
|---|---|
| `GET /v1/brand-member/me?business=&localUserId=` | 身份（脱敏手机号）、品牌卡期、积分、骰子、权益、游戏 URL；续费未生效时附 `pendingCard` |
| `GET /v1/brand-member/products` | 当前生效的月卡/年卡、价格、天数、权益、积分模式 |
| `POST /v1/brand-member/quote` | 报价 30 分钟有效；金额与版本由 CRM 决定 |
| `POST /v1/brand-member/issue` | 支付后开卡；`paidCents` 必须等于报价，`orderRef` 幂等；续费接在旧卡结束后一天 |
| `POST /v1/brand-member/game/ticket` | 有效品牌卡换 5 分钟一次性票据；库里只存哈希 |

品牌会员不变量：卡期与权益按开卡时的产品版本快照，后续改价不影响已购；报价一次性使用；同 `orderRef` 不重复开卡；游戏票据不暴露会员号/手机号；CRM 不接管在场畅练卡与轻疗历史卡卡期，`businessCards` 本期返回空数组而非伪造。

**环境策略**：现在只运行一套准生产 CRM（S1），轻疗测试、时叙、在场都连它；轻疗用户是身份母集。开业前另建生产实例 P，只迁真实用户，S1 留作测试。详见设计文档 §18。

## 不变量与安全决策

- 余额 = 未过期 ACTIVE 批次的 `remaining` 合计；流水只追加，`balance_after` 与批次同步变化，测试逐会员校验三者一致。
- 扣减按“到期最早优先，再按获得时间”；条件更新 `remaining >= take`，并发失败返回 409，不出现负余额。
- 调整单审批人不得是发起人；非 PENDING 单据不可再次处理；审批失败整单回滚且单据保持待审批。
- 幂等键绑定请求体哈希（排序键后的规范 JSON）；同键不同内容返回 409，同键同内容重放同一结果。
- 审计只追加；会员档案查看按“操作人 + 会员 + 自然日”去重，避免刷新刷屏。
- 登录失败统一 401；JWT 带 `ver`，与员工 `tokenVersion` 不一致即失效。
- 手机号在 CRM 内为明文（经权限与审计控制）；向三端只下发 `phoneMasked`。
- 品牌卡状态按日期实时计算：未开始 `PENDING`、剩余 ≤30 天 `EXPIRING`、到期后 `EXPIRED`；退款锁/已退来自库内状态。
- 游戏票据 5 分钟有效，只存 SHA-256；`savedCents` 与业务核销明细未接入时返回 0；礼物待领数来自 CRM 礼物账本。管理后台只持有员工 JWT，所有权限以服务端校验为准。

## 未实现（后续批次，各自独立计划与授权）

- 1F 剩余：在场畅练卡/轻疗旧卡的卡期快照落库（当前只读目录，不伪造有效期）、身份合并后台操作、积分写入权威从各端切到 CRM；三端身份、余额与品牌会员只读接入已在本机完成（见文末）。
- 真实支付渠道与退款回调：当前只接受已支付结果，CRM 不代收、不查询渠道；上线前需与各端支付链路单独联调。
- MySQL 切换与迁移演练、生产部署、监控告警与备份恢复演练。
- 真实数据的身份合并审批、历史积分迁移核对表与差异报告（须先用脱敏导出演练）。

## E1 验证记录（2026-11-08）

- `pnpm test`：**55/55 通过**（Jest 29 + supertest，每个 spec 复制独立 SQLite 模板库）。覆盖会员/积分/审计、大会员卡与业务卡、`x-crm-*` 与 `X-Fy-*` 契约、骰子/规则/礼物、月度对账、outbox 投递与重试、角色权限即时生效；含“审批人不能是发起人”、重复领取 409、无卡 403、月上限、余额不足整单回滚等负向用例。
- `pnpm lint`：server 与 shared 无类型错误；`pnpm build:server` 通过。
- 管理后台（同源 `/admin/`，合成账号）：登录、概览、会员检索与档案、≤500 直接入账、>500 待审批、发起人自审 403、财务审批后入账、规则待生效版本创建与撤销、年卡草稿版本创建与激活（旧版归档）、业务卡目录编辑、同步即时投递、角色权限保存均实测通过；页面无控制台错误。后台只调用服务端 API，权限负向由服务端返回。
- 启动冒烟：`node dist/main.js`（`/api/health` 200、`/admin/` 200、`/` 302 到 `/admin/`）；登录、会员检索、同键重放、>500 待审、财务审批入账均已实测。
- 1C/1D 契约冒烟：真实 HMAC 调用 `me`、产品、报价/开卡、游戏票据、掷骰、得骰/退款；同 nonce 409 `REPLAYED`、金额不符 409 `AMOUNT_MISMATCH`、无卡 403，均实测。冒烟与 UI 联调后已重新 seed 恢复干净状态。
- 未测：真实 MySQL、并发压测、真实支付回调、三端真机联调、部署环境与监控。后台 UI 是功能 E1，不是视觉验收；截图视觉检查需在可用浏览器窗口下单独进行。

## 1F 三端身份与余额接入（本机，2026-11-08）

范围：身份宇宙 = 轻疗现有用户；时叙、在场的演示数据不迁移。三端只读 CRM（解析身份、读余额），积分写入权威仍在各端自己账本，切换留待后续独立授权。

- 契约：三端共用 1C 外部契约（HMAC-SHA256 头、`ext:{business}:{ref}` 幂等、`business` 由 key 绑定、409 `IDENTITY_CONFLICT` 不自动合并）。业务键：`sx` 时叙、`zc` 在场、`ql` 轻疗；密钥只走环境变量 `CRM_EXT_KEYS`。
- 时叙（`sx`）：`apps/server/src/crm/{crm.client,crm.config,crm.module}.ts` + 对应 spec；`auth.service` 的顾客视图经 `resolve` 覆盖余额，CRM 开启但不可用时显式报错，不回退本地 0。E1 冒烟（真实签名对本地 CRM）已通过。
- 在场（`zc`）：`apps/server/src/common/crm/*`，`auth.service` / `user.service` 读取余额；`apps/server/test/crm-client.spec.ts` 7/7 通过。集成套件未运行：它会连开发库指向的真实阿里云 RDS，属禁止范围。
- 轻疗（`ql`）：`mall-admin/src/main/java/com/macro/mall/crm/`（`CrmProperties`、`CrmClient`、`CrmSyncService`、`CrmController`、身份/会员/导入结果 DTO）、`CustomerService` 登录与余额接入、`CustomerWxMapper.findUnionIdByMaOpenId`、`application.yml` 的 `crm` 段、`CrmClientSignTest`、`CrmSyncLiveSmokeTest`、说明 `docs/crm-integration.md`。状态 E1（本机）：Amazon Corretto 11 + Maven 3.9.9 编译与打包通过，`CrmClientSignTest` 3/3；`CrmSyncLiveSmokeTest` 用真实 Java 客户端对本机 CRM 跑通解析、新客 66 分、`migrate:` 300 分、导入 + 迁移 120 分、同手机号绑定、unionId/手机号冲突 409，且可重复执行。真实轻疗用户导入仍未执行。
- `ql` 契约本机冒烟（Node 按 Java 客户端逐字复刻签名与请求体，对本地 CRM + 临时 SQLite）：导入 2 条 created；resolve `created:false` 余额 0；新客 66 入账；同 ref 重放返回同一 ledgerId；查询余额 66；迁移 300 入账且重放幂等；未同步会员 404；错误签名 401；非法条目按条进 failed；unionId 与手机号分属两个会员时 resolve 409。审计落“外部导入会员”“外部积分入账”。冒烟后临时库与进程已清理。

### 品牌会员 1F：三端服务端代理（本机 E1 + 测试环境 E2，2026-11-08）

三端小程序不直连 CRM，统一经各自服务端代理；签名密钥只存在于服务端环境变量，会员身份固定取当前登录用户，客户端无法改 `localUserId`、金额或积分。

- 时叙 `sx`：`apps/server/src/crm/brand-member.{config,client}.ts` + `apps/server/src/api/customer-brand-member.controller.ts`。路由 `/customer/brand-member/{me,products,quote,purchase,game/ticket}`，`CustomerGuard` 取身份；quote 30 次/分、purchase 20 次/分、ticket 30 次/分；purchase 在支付接入前返回 501 `PAYMENT_NOT_ENABLED`，不越过扣款直接开卡。
- 在场 `zc`：`apps/server/src/common/crm/brand-member.{config,client}.ts` + `modules/member/brand-member.controller.ts`。路由 `/member/brand/{me,products,quote,purchase,game/ticket}`（`AuthGuard('jwt')`）；`me` 同时合并在场畅练卡的只读快照（仅 ACTIVE 且未过期，按剩余天数给 ACTIVE/EXPIRING），CRM 返回的同码快照会被过滤，避免重复；purchase 返回业务码 5034 / HTTP 501。
- 轻疗 `ql`：`mall-admin` 的 `crm/brand/{BrandMemberProperties,BrandMemberClient}.java` + `controller/BrandMemberController.java`。路由 `/brandMember/{me,products,purchase,game/ticket}`，身份取 Session 当前客户；`application.yml` 安全白名单已登记；purchase 抛出 501 业务异常（`BusinessException`），未登录抛出 401。注意轻疗 `GlobalExceptionHandler` 对业务异常统一回包 `CommonResult.failed(message)`（HTTP 200、body `code:500`），线上只能按 `message` 区分，不能把 body `code` 当 401/501 用。
- 三端均使用独立业务键与独立 `BRAND_CRM_KEY_ID` / `BRAND_CRM_SECRET`（不复用导入用的 `ql` 密钥）；生产环境强制 HTTPS（回环地址除外），密钥 ≥16 位、不入库、不写日志。配置关闭时返回“品牌会员服务尚未开启”，不发起请求。
- 小程序：生产构建默认 `server` 模式，`mock` 仅供本地；非 mock 下购卡入口明确提示“线上支付接入中”，不产生假成功。愈行之旅每次点击由服务端换新票据，避免 5 分钟过期。

E1 证据（本机）：时叙品牌会员 client/proxy/crm 套件 **19/19**；在场品牌会员 CRM 套件 **11/11**，在场全部单元套件 **294/294**（不含需连开发库的 `full-flow.integration-spec`）；轻疗 Java 品牌会员 **8/8**（`BrandMemberClientTest` 5 + `BrandMemberControllerTest` 3），`mall-admin -am` 全量编译通过；三端 H5/小程序构建通过。

E2 证据（测试环境，2026-11-08）：

- CRM：用 `sx-teahour` / `zc-presence` / `ql-mall-test` 三把真实密钥分别签名探测 `GET /api/v1/brand-member/products`，均 `200`，返回 `FY_MONTH` / `FY_ANNUAL`；后台 `https://mall-test.fullyu.cn/crm-admin/`（推荐）与 `https://mall-test.fullyu.cn/crm-api/admin/` 均返回 `200`，页面脚本含品牌会员、品牌卡、业务卡与愈行之旅入口。两条入口的 `config.js` 都推导为 `/crm-api/api`；`/crm-admin/` 登录表单渲染正常、错误口令命中 `/crm-api/api/auth/login` 返回 401，登录后的页面渲染未在浏览器内用真实账号复验（同版本 UI 已在本机走查）。
- 轻疗：`https://mall-test.fullyu.cn/api/brandMember/products` 返回 `200` 且产品来自 CRM；`/brandMember/me` 未登录返回“请先登录”。后端 `mall-admin-1.0-SNAPSHOT.jar`、H5 已替换并重启。
- 时叙：`https://teahour.fullyu.cn/api/health` `200`；`/api/customer/brand-member/products` 未登录 `401`；服务端、后台 `dist`、H5 `/mp/` 均已更新。H5 首次构建漏了 `VITE_BASE=/mp/` 与 `VITE_API_BASE`，已按 `/mp/` 基路径重新构建并给 `/mp/` 加 `Cache-Control: no-cache`；浏览器实测首页正常、品牌页请求命中 `https://teahour.fullyu.cn/api` 并返回 401。
- 在场：`https://test-zaichang.fullyu.cn/api/v1/health` `200`；`/api/v1/member/brand/products` 未登录 `401`；PM2 `fullyu-api` 在线。
- 轻疗 H5：首次把不完整的 10KB uni-app H5 覆盖到 `/opt/fullyu-mall-test/web`，已先回滚到 `web-20261108-before-brand.tgz`，再用 HBuilderX 内置 Node 重建（1.8MB、含品牌页 chunk）并部署；浏览器实测首页与品牌页正常，品牌页请求命中 `https://mall-test.fullyu.cn/api/brandMember/*`。
- 三端小程序 `mp-weixin` 生产包已上传开发版：时叙 `1.0.24`（872.9 KB）、在场 `1.0.1`（743.9 KB）、轻疗 `1.0.8`（1002.2 KB）；appid 分别为 `wxd9e4e4568d1bc8bb`、`wxa7572dea26f5f4e4`、`wxeb4e8a99b7eeebf8`（轻疗以 `project.config.json` 为准，`manifest.json` 的 `wxaadd305c8114034a` 是旧值）。上传账号需有开发者权限；体验版切换与提审仍需在公众平台手动操作。

未做：真实轻疗用户以外的新客全链路真机联调、积分过期规则（写入权威已在轻疗切到 CRM，过期规则未实现）、业务卡期快照、身份合并后台操作、真实支付与小程序上传/提审/发布。

## 测试环境部署（2026-11-08）

部署在在场服务器 `47.111.136.49`（私网 `172.19.180.137`），只作测试环境使用，生产未动。

- 代码：`/opt/fullyu-crm`（rsync 自本仓库，排除 `node_modules/.git/dist/db`），`pnpm install --frozen-lockfile` + `prisma generate` + `pnpm build:server`。
- 运行：systemd `fullyu-crm.service`（用户 `crm`，`WorkingDirectory=/opt/fullyu-crm/apps/server`，`ExecStart=/usr/bin/node dist/main.js`，`EnvironmentFile=/etc/fullyu-crm/crm.env`，`ProtectSystem=full`，`Restart=on-failure`）。
- 网络：CRM 绑定私网 `172.19.180.137:8898`，阿里云安全组不放行 8898，公网不可达。
- 对外入口：轻疗测试机 `121.40.119.57` 上 `https://mall-test.fullyu.cn/crm-api/` → nginx `location ^~ /crm-api/`（去前缀）→ `127.0.0.1:8899` → 受限 SSH 隧道 `crm-tunnel.service`（专用密钥 `no-pty` + `permitopen=172.19.180.137:8898`）→ CRM `:8898`。三端只走 HTTPS，不直连私网。
- 密钥：`JWT_SECRET`、`CRM_EXT_KEYS`（`ql-mall-test` / `sx-teahour` / `zc-presence`）在 `/etc/fullyu-crm/crm.env`（600，root）；后台初始口令在 `.seed-password`（600）。均未写入仓库或日志。
- 数据库：`/opt/fullyu-crm/data/crm.db`（SQLite），切换前快照 `crm.db.bak-*`。
- 三端品牌会员代理（2026-11-08 同批）：时叙 `/etc/teahour/api.env`、在场 `/root/fullyu/apps/server/.env.local`、轻疗 `/opt/fullyu-mall-test/crm.env` 各配置独立的 `BRAND_CRM_ENABLED=1` / `BRAND_CRM_BASE_URL=https://mall-test.fullyu.cn/crm-api` / `BRAND_CRM_KEY_ID` / `BRAND_CRM_SECRET`。密钥通过 SSH 管道写入，未落仓库、未打印。
- 管理后台（2026-11-08 第三批）：推荐入口 `https://mall-test.fullyu.cn/crm-admin/` → nginx `location ^~ /crm-admin/` → `127.0.0.1:8899/admin/`（同一 SSH 隧道）。nginx 用精确匹配覆盖 `/crm-admin/config.js` 返回 `window.CRM_API_BASE='/crm-api/api'`；仓库的 `apps/admin/public/config.js` 也会按当前 `/admin/` 前缀推导 API 根（`/crm-api/admin/` → `/crm-api/api`，直接访问 CRM 内网 `/admin/` → `/api`）。登录成功但响应缺少 `staff` 时前端明确报“登录响应异常”，不再抛 `Cannot read properties of undefined`。后台账号由管理员分配。

## 轻疗真实数据导入（测试环境，2026-11-08）

轻疗测试后端（`tou-mall_test`，9904 名客户）已切到 CRM 账本，开关在 `/opt/fullyu-mall-test/crm.env`（`CRM_ENABLED=1`）。导入走后台管理员接口 `POST /customer/crm/import`，分批执行：

- 身份：9904 名客户全部导入，0 失败；CRM 侧 ql 身份 9905 条、去重后 9862 个会员（created 9362 / bound 42 同手机号 / unchanged 1）。
- 积分：本地有效积分 1601 行 / 78334 分 / 1253 人，迁移 1253 人 / 78334 分，0 失败；抽检会员余额与本地 SQL 一致。
- 幂等：重放批次后 CRM 流水仍 1255 行（2 seed + 1253 migrate），无重复入账。
- 登录闭环：合成手机号新客首次登录得 66 分（`welcome:{id}`），二次登录不重复，`/customer/getIntegration` 返回 CRM 余额。
- 清理：部署冒烟用的合成会员（`ql:990001`，66 分）已在正式导入前删除。

### 第三批收尾（2026-11-08）

- **轻疗积分写入切到 CRM**：下单抵扣、退单返还、评价抽奖、推荐人积分、后台手动调整全部以 CRM 余额为准，本地 `s_integration` 只作影子审计与幂等锚点；冒烟实测 116 → 96（扣 20）→ 76（扣 20）→ 余额不足明确拒绝 → 56（再扣 20）→ 退款返还 76，重复取消不再重复返还。细节与回滚见 [`轻疗/docs/crm-integration.md`](../Full愈-轻疗/docs/crm-integration.md) 第 10 节。
- **时叙指向 CRM**：`/etc/teahour/api.env` 增加 `CRM_ENABLED=1` / `CRM_BASE_URL=https://mall-test.fullyu.cn/crm-api` / `CRM_KEY_ID=sx-teahour` / `CRM_SECRET`（600，SSH 管道写入）；部署本机当前 `apps/server` 的 `dist/auth/{auth.controller,auth.module,auth.service}.js`（其余文件与服务器一致），重启 `teahour-api`。实测顾客 `GET /api/customer/me` 从 CRM 读余额：先 0，CRM 入账 5 分后返回 5，回收后返回 0；CRM `member_identities` 新增 `sx` 身份。登录/顾客视图在 CRM 不可用时明确报错，不回退本地积分。
- **在场指向 CRM**：`/root/fullyu/apps/server/.env.local` 增加同结构 `CRM_*`（`zc-presence`）；服务器源码树按本机 `modules/auth/auth.service.ts`、`modules/user/user.service.ts` 的 CRM 段落打补丁后 `npm run build`，备份为 `/tmp/auth.service.ts.bak`、`/tmp/user.service.ts.bak`、`/tmp/zc-dist-bak`。构建有 14 个既有的 `scm` 类型错误（与本批无关），tsc 仍产出；核对只有上述两个 `.js` 变化，`main.js` 未变。重启 PM2 `fullyu-api` 后 `GET /api/v1/user/points` 实测 0 → 5（CRM 入账）→ 0（回收），CRM `member_identities` 新增 `zc` 身份。
- **轻疗品牌会员代理复核**：运行 jar `mall-admin-1.0-SNAPSHOT.jar` 含 `BrandMemberController` 与 `crm/brand/*`；`/api/brandMember/products` 返回 CRM 定价（`FY_MONTH` / `FY_ANNUAL`），未登录 `/me` 与 `/purchase` 均返回“请先登录”（HTTP 200、body `code:500`，轻疗全局异常统一包装，见品牌会员一节）。本机 `BrandMemberClientTest` 5 + `BrandMemberControllerTest` 3，**8/8 通过**（控制器测试断言异常状态 401/501，线上回包被包装为 `code:500`）。
- **管理后台**：静态资源与 API 基址改造见“测试环境部署”；`/crm-admin/` 加载 `config.js`（`/crm-api/api`）、登录表单渲染正常，错误口令请求命中 `/crm-api/api/auth/login` 并返回 401；服务端用真实账号验证 `/auth/me`、`/members`、`/adjustments`、`/brand-cards`、`/business-cards`、`/rules`、`/game/prizes`、`/sync/status`、`/queue`、`/reports/monthly`、`/audit`、`/roles` 均 `200`。登录后的页面渲染未在浏览器内复验（避免在日志中传递口令），此前本机已完成同版本 UI 走查。

已知缺口：真实支付未接，三端购卡返回“支付通道尚未接入”；业务卡期快照与身份合并后台操作未做；三端小程序已上传开发版，体验版切换与提审待公众平台操作；时叙/在场积分仍只读 CRM，写入权威未切换（本批只完成轻疗写入切换）；CRM 不再计算积分过期（`getInvalidIntegration` 恒为 0），过期规则需随写入切换单独实现；CRM 写入成功但本地事务回滚的崩溃窗口只能靠稳定 ref 重放核对，尚无自动巡检。
