# Full愈 CRM 中台设计（时叙 × 在场 × 轻疗）

- 日期：2026-11-07
- 状态：设计已逐节确认，待用户审阅本文档后进入实施计划
- 范围：一期（MVP）；二期只列方向
- 授权边界：本文档不是部署、写生产库、改三端线上 schema、提交/发布或真实扣款授权；这些动作分别另行授权。

---

## 1. 背景与现状（2026-11-07 代码核查）

| | 时叙 | 在场 | 轻疗 |
|---|---|---|---|
| 工程位置 | `~/Desktop/Full愈-时叙`（apps/server、admin、miniprogram） | `~/Desktop/Full愈`（apps/server、admin、miniprogram） | `~/Desktop/Full愈-轻疗`（tou-mall-server、tou-mall-admin-web、full-yu-mini2） |
| 技术栈 | NestJS + Prisma；开发 SQLite、上线 MySQL | NestJS + Prisma + MySQL | Java Spring + MyBatis-Plus + MySQL |
| 小程序 | 时叙小程序 | `wxa7572dea26f5f4e4` | `wxeb4e8a99b7eeebf8` |
| 用户身份 | `customers.phone` 唯一；存 `open_id`、`union_id` | `users.phone` 唯一；存 `openId`、`unionId`（非唯一） | `c_customer.phone` 建档；unionid 在 `c_customer_wx`，无 `customer_id` 外键 |
| 资料 | 姓名、性别(1/2/null)、生日、头像 | 无性别/生日 | 有性别，无生日 |
| 年卡 | `member_tier=annual` + `member_until`；每杯减 200 分 | `member_cards` 月/季/年卡、冻结、权益 JSON（在场自有卡） | `c_customer_member_card` 按期，7.8/8.8 折快照，续费顺延，退款仅改状态；仅测试环境 |
| 积分 | `customers.points` 只读余额，无获取/消耗逻辑 | `points_records` 流水（带 balance），1 分=1 元，不过期 | `s_integration` 批次，1 分=1 元，1–10 月获得次年 1/1 过期、11–12 月获得后年 1/1 过期，查询时顺手过期 |
| 跨系统 | `ProfileSyncProvider` 为 Noop 占位 | 无 | `/fully/open/**` 固定 token，无签名 |

结论：三端都以手机号为身份，打通基础存在；年卡与积分是三套互不兼容的规则，必须由 CRM 成为唯一账本，而不是三端互相同步余额。

## 2. 已确认的决策

| # | 决策 | 结论 |
|---|---|---|
| D1 | 系统对应 | 在场 = `~/Desktop/Full愈` 课程系统；轻疗 = tou-mall + full-yu-mini2；共三套系统 |
| D2 | 年卡口径 | 一张 Full愈 通用年卡，统一售价与有效期，三个小程序都可购买；权益按业务分别配置；在场原有月/季/年卡留在在场，不纳入 CRM |
| D3 | 积分口径 | 一个积分账户，1 分抵 1 元；获取规则按业务在 CRM 后台配置；过期统一采用轻疗现行规则，先过期先用 |
| D4 | 年卡收款 | 哪里卖哪里收款（业务自有汇付/微信商户）；CRM 不碰资金，只在“验签后的支付成功”之后开卡 |
| D5 | 架构 | 独立 CRM 中台 + 独立库作为唯一账本；三端经签名 API 调用；CRM 用 webhook 推送变更，三端保留只读快照 |
| D6 | 退卡 | 开卡后 7 天内且三端均未使用权益可全额退；其余按“实付 − 已享优惠（最低 0）”给出建议额，总部审批，在原售卖业务退款 |

工程默认项（不需要经营决策，按此执行）：

- 购买年卡本身不产生积分。
- 积分只由 CRM 依据业务上报的事实（订单号、实付金额、状态）计算，不信任客户端或业务端传入的分数。
- 金额一律存整数分，积分存整数。
- 未配置获取规则的业务，`earn` 明确返回 `RULE_NOT_CONFIGURED`，同时发放 0 分，不静默成功。

## 3. 总体架构

```
 时叙后端 ─┐                         ┌─ CRM 后台（总部运营/财务/客服）
 在场后端 ─┼─ 签名 API ─▶ Full愈 CRM ─┤
 轻疗后端 ─┘ ◀─ 签名 webhook ─        └─ 定时任务：过期 / 预占超时 / 对账 / 提醒 / 月结
```

- **CRM 服务**：NestJS + Prisma + MySQL 8，`@nestjs/schedule` 承担定时任务；与时叙、在场同栈。
- **CRM 后台**：React + Vite，复用时叙后台 `StaffShell`、权限与列表模式；视觉沿用时叙 V7 token。
- **SDK**：
  - `@fullyu/crm-sdk`（TypeScript）：给时叙、在场使用，内含签名、重试、出站任务助手和 webhook 验签。
  - `CrmClient`（Java）：给轻疗使用，提供同等能力。
- **仓库**：新建 `~/Desktop/Full愈-CRM`（pnpm monorepo：`apps/server`、`apps/admin`、`packages/sdk`、`packages/shared`、`sdk-java/`）。
- **环境**：`crm-test.fullyu.cn`（测试，合成数据）、`crm.fullyu.cn`（生产）。两者独立库、独立密钥；部署另行授权。

### 3.1 一致性原则

1. CRM 是年卡与积分的唯一事实来源；三端本地只存快照，快照不能作为扣减依据。
2. 所有写接口都必须带幂等键，格式为 `业务:动作:业务单号`，由库内唯一约束兜底；同键同内容返回原结果，同键异内容返回 `409 IDEMPOTENCY_CONFLICT`。
3. CRM 内的写操作与 `outbox_event` 在同一事务中提交，事件由发件箱异步投递。
4. 业务端调用 CRM 前，先把请求写入本地 `crm_outbound_task` 表；调用成功再标记完成。遇到超时等结果未知的情况，先查询再决定，不重复发起新的业务动作。
5. 禁止 catch 后显示成功、禁止把失败当作空数据。

### 3.2 CRM 不可用时的降级

| 能力 | 降级行为 |
|---|---|
| 展示年卡/积分 | 读本地快照，并标注“更新于 HH:mm” |
| 年卡折扣 | 快照 `synced_at` 在 10 分钟内可照常给折扣，订单标记 `benefit_check=snapshot`，恢复后补上报并对账；超过 10 分钟不给折扣，提示稍后再试 |
| 积分抵扣、开卡、退卡 | 失败关闭（fail closed），提示“积分服务暂不可用，可先不使用积分支付” |
| 支付成功后开卡/发分 | 写出站任务，按指数退避重试直到成功（最长 24 小时，超时转人工队列）；顾客端显示“开通中” |

## 4. 统一身份与资料

### 4.1 识别与建档（`POST /v1/members/resolve`）

入参：`business`、`localUserId`、`phone`、`unionId?`、`openId?`、`appId`。

1. 按 `(business, localUserId)` 查映射，命中则返回。
2. 否则按 `phone` 精确匹配；再按 `unionId` 精确匹配。
3. 都没有命中：新建会员，会员号 `FY-yyMM-NNNNNN`。
4. 手机号和 unionId 指向两个不同会员时，**不自动合并**：按手机号归属，同时生成 `identity_conflict` 工单。
5. 不做姓名、生日等字段的模糊匹配。

前置核验（实施时确认）：三个小程序是否绑定到同一个微信开放平台账号。未绑定时 unionId 不可跨端比较，只靠手机号识别。

### 4.2 资料

- 姓名、性别（1 男 / 2 女 / null）、生日、头像，均以 CRM 为准。
- 三端修改资料都调 `PUT /v1/members/{id}/profile`，并带上 `baseVersion`；版本落后返回 `409`，前端提示刷新后再改。
- 变更通过 `member.profile.changed` 事件广播，消费端只接受比本地快照更新的版本。
- 头像存 CRM 对象存储；三端只保存 URL。

### 4.3 会员码

- 统一使用 `FY-` 会员码（动态二维码：会员号 + 时间戳签名，有效 60 秒，防截图转用）。
- 旧的 `TH-`、`ZC-` 静态码写入 `member_code_alias`，过渡期内继续可扫；过渡期结束后由后台开关停用，只认动态码。
- 店员扫码后调 `GET /v1/members/by-code/{code}`，由 CRM 返回真实权益。

### 4.4 换绑、合并、注销

- **换手机号**：只能由客服在 CRM 后台发起，需要另一人审批，全程审计；完成后广播 `member.profile.changed`。
- **合并两个会员**：后台人工操作并审批。被合并的会员状态改为 `MERGED`，其积分批次、卡期、映射和码别名迁到保留方，广播 `member.merged`。
- **注销**：顾客在任一端申请后，进入 15 天冷静期。到期后执行：
  - 有生效年卡的，必须先完成退卡或明确放弃；
  - 积分作废；
  - 个人信息匿名化，交易流水保留；
  - 广播 `member.deactivated`，三端各自删除或匿名化本地资料。

### 4.5 授权与合规

- 隐私政策需写明 Full愈 各业务之间共享会员身份、年卡与积分信息。`consent` 表记录政策版本、渠道、时间和撤回情况。
- 政策版本变更后，顾客下次登录时需要重新确认。
- 最小必要原则：API 按调用方业务裁剪字段，不返回其他业务的订单明细或成本。
- ~~后台手机号默认脱敏；查看明文需要 `crm:member:reveal` 权限，且每次查看都记审计。~~（2026-11-08 已调整：CRM 内明文、业务后台脱敏，见 §16.1）

## 5. 年卡

### 5.1 配置

- `card_product`：名称、售价（分）、有效天数、续费提醒天数、在售/停售、版本。
- `card_benefit_config`：每个业务一份，带版本和生效时间。`rules_json` 示例：
  - 时叙 `{"type":"per_cup_off","cents":200}`
  - 轻疗 `{"type":"booking_rate","advanceRate":0.78,"sameDayRate":0.88}`
  - 在场 `{"type":"course_member_price","memberType":"FULLYU_ANNUAL"}`：具体课程价格仍由在场的 `course_member_discounts` 配置，CRM 只判定资格。
- 开卡时把三端当时生效的权益快照写入卡期（沿用轻疗现有做法），之后修改配置不影响已售卡。

### 5.2 卡期状态机

`PENDING`（续费后待生效）→ `ACTIVE` → `EXPIRED`；`ACTIVE`/`PENDING` → `REFUND_LOCKED` → `REFUNDED`，或经 `REFUND_LOCKED` → 解锁回原状态。

- 首次开卡：`start = 支付时间`，`end = start + validDays`。
- 续费：`start = max(now, 当前最晚到期)`，新卡期为 `PENDING`，到时间由定时任务转为 `ACTIVE`。
- 会员年卡汇总：存在 `ACTIVE` 卡期即为会员；`validUntil` 取所有未退卡期的最晚到期日。

### 5.3 购买流程

1. 业务端调 `POST /v1/cards/quote`，CRM 返回锁定的售价和 `quoteId`。报价发起支付的有效期为 30 分钟，超时需要重新报价；已支付的报价在 24 小时内仍可用于开卡。
2. 业务端用自有商户收款。
3. 支付回调验签成功后，业务端调 `POST /v1/cards/issue`。入参：`quoteId`、`paidCents`、`orderRef`、`paidAt`；幂等键 `业务:card-issue:orderRef`。起止日期在开卡时按 5.2 的规则重新计算，以免报价后又有续费导致日期重叠。
4. 如果 `paidCents ≠ 报价金额`，或报价超过 24 小时，CRM 拒绝开卡并转入人工队列（资金已到账，需人工处理退款或补开），不擅自按其他金额开卡。

### 5.4 权益使用上报

- 业务端用快照权益计算优惠，金额由本业务服务端核验。
- 订单支付成功后调 `POST /v1/cards/benefit-usage`：`periodId`、`orderRef`、`savedCents`；幂等。
- 订单退款时调 `.../benefit-usage/{id}/reverse`，冲减相应金额。

### 5.5 退卡

1. 售卖业务调 `POST /v1/cards/{periodId}/refund-quote`，CRM 计算：
   - 支付后 7 天内且无未冲减的权益使用 → 全额；
   - 否则建议额 = `paidCents − Σ未冲减 savedCents`，最低为 0。
2. 非全额退卡时，生成审批单，由 CRM 后台财务审批（审批人不能是发起人），审批可以下调金额，但不能超过建议额。
3. 业务端调 `refund/lock`：卡期进入 `REFUND_LOCKED`，权益立即停用。
4. 业务端发起渠道退款。退款成功后调 `refund/confirm`（带 `refundedCents`，不得超过批准额）；明确失败时调 `refund/abort` 解锁。结果未知时，先向渠道查询，再决定 confirm 或 abort。
5. 只允许退最后一期卡（避免卡期中间出现空档）。

## 6. 积分

### 6.1 规则配置（`point_rule`，按业务、带版本）

```json
{ "earn": { "centsPerPoint": 1000, "rounding": "floor", "cardMultiplier": 1 },
  "bonus": { "newMember": 0, "review": 0 },
  "holdTtlMinutes": 30, "earnCoolingDays": 0 }
```

- 表中数值仅为结构示例，实际值由各业务运营在后台配置；配置变更进入审计。
- `holdTtlMinutes` 必须大于该业务的订单支付超时时间。

### 6.2 批次与过期

- 每次发放生成一个 `point_batch`，记录 `issuer_business`、`amount`、`remaining`、`earned_at`、`expire_at`。
- 到期日规则：`earned_at` 在 1–10 月 → 次年 1 月 1 日 00:00（Asia/Shanghai）；11–12 月 → 后年 1 月 1 日。
- 每天 00:05 由定时任务真正执行过期，写 `EXPIRE` 流水并广播事件；查询余额时也排除已到期批次，作为双保险。

### 6.3 消耗（预占 → 确认 / 释放）

1. `POST /v1/points/holds`：`orderRef`、`points`。CRM 在一个事务内按到期日最早优先锁定批次的 `remaining`（`SELECT … FOR UPDATE`），余额不足返回 `INSUFFICIENT_POINTS`。
2. 支付成功后调 `holds/{id}/confirm`，写 `CONSUME` 流水，并记录每个批次扣了多少。
3. 支付失败或取消时调 `holds/{id}/release`；预占超时由定时任务自动释放。
4. 预占已超时释放、之后才调 confirm 时：重新尝试预占，余额足够则确认；不足则返回 `POINTS_HOLD_EXPIRED`，订单进入人工队列，不允许出现负余额。
5. 已确认后发生退款：调 `POST /v1/points/refund`，按 `orderRef` 退回原批次，保持原到期日；原批次已过期的部分不退回，并在流水中写明原因。

### 6.4 发放与撤回

- `POST /v1/points/earn`：`orderRef`、`paidCents`、`paidAt`；CRM 按规则计算分数，幂等。
- 如果配置了冷静期，批次先处于 `PENDING`，冷静期满后才能使用。
- 订单退款时调 `points/revoke`：按退款金额占实付的比例撤回该订单发放的积分。先扣该批次剩余部分；不足的部分记入 `point_debt`，从后续发放中优先抵扣，余额不出现负数。

### 6.5 人工调整

客服在后台发起，必须填写原因和关联单号。超过阈值（默认 500 分，可配置）需要第二人审批；审批通过后写 `ADJUST` 流水。

## 7. 其他一期功能

1. **客户 360 视图**：资料、身份映射、年卡卡期与权益使用、积分批次与流水、各业务最近消费与到店记录（业务端通过 `activity` 事件上报订单摘要，不传商品成本），以及授权记录。
2. **业务间对账报表**（按月）：
   - 年卡：按售卖业务统计销量与实收、按使用业务统计已享优惠；
   - 积分：发行业务 × 消耗业务的矩阵（1 分 = 1 元负债）、过期金额、期末未用余额。
   - 系统只出事实数据，分摊比例由财务另定，CRM 不生成结算凭证；报表中的预估不等于已结算。
3. **每日对账任务**：三端各提供 `GET /crm/recon?date=` 接口，返回当日涉及年卡/积分的订单清单。CRM 与自己的流水逐笔比对，差异写入 `recon_diff`，在后台工作台处理。
4. **到期提醒**：
   - 触发条件：年卡到期前 `renewRemindDays` 天；积分在 1 月 1 日过期前 30 天、7 天。
   - CRM 选择会员最近活跃的业务，发出 `notify.requested` 事件，由该业务的小程序发送微信订阅消息。
   - 受限于订阅消息需要顾客事先授权，未授权的只在小程序内显示提示。
5. **审计日志**：后台所有写操作、查看明文手机号、配置变更、审批，全部留痕，日志只追加不修改。
6. **后台角色**：
   - `CRM_ADMIN`：全部权限；
   - `CRM_OPS`：会员查询、规则配置；
   - `CRM_FINANCE`：对账、退卡审批、积分调整审批；
   - `CRM_CS`：客服，可发起换绑和单笔积分调整（2026-11-08：CRM 内看明文，见 §16.1）。
   - 审批人与发起人必须不同。

## 8. 数据模型（CRM 库，节选关键字段）

| 表 | 关键字段 / 约束 |
|---|---|
| `member` | `id`、`member_no` 唯一、`phone` 唯一、`union_id` 索引、`name`、`gender`、`birthday`、`avatar_url`、`status`(ACTIVE/MERGED/DEACTIVATING/DEACTIVATED)、`merged_into`、`profile_version` |
| `member_identity` | `business`、`local_user_id`、`app_id`、`open_id`、`member_id`；唯一 `(business, local_user_id)` |
| `member_code_alias` | `code` 唯一、`member_id` |
| `identity_conflict` | 冲突双方、证据、处理状态与人 |
| `consent` | `member_id`、`policy_version`、`business`、`granted_at`、`revoked_at` |
| `card_product` / `card_benefit_config` | 见 5.1；`(product_id, business, version)` 唯一 |
| `card_quote` | `id`、`member_id`、`price_cents`、`start_at`、`end_at`、`expires_at` |
| `member_card_period` | `card_no`、`period_no`、`member_id`、`start_at`、`end_at`、`status`、`sold_by`、`order_ref`、`paid_cents`、`paid_at`、`benefit_snapshot`、`refunded_cents`；唯一 `(sold_by, order_ref)` |
| `card_benefit_usage` | `period_id`、`business`、`order_ref`、`saved_cents`、`reversed_cents`；唯一 `(business, order_ref)` |
| `card_refund` | `period_id`、`suggested_cents`、`approved_cents`、`refunded_cents`、`status`、发起/审批人 |
| `point_rule` | `business`、`version`、`rules_json`、`effective_from` |
| `point_batch` | `member_id`、`issuer_business`、`source_ref`、`amount`、`remaining`、`status`(PENDING/ACTIVE/DEPLETED/EXPIRED/REVOKED)、`earned_at`、`expire_at`；索引 `(member_id, status, expire_at)` |
| `point_hold` | `member_id`、`business`、`order_ref`、`points`、`allocations`、`status`(HELD/CONFIRMED/RELEASED/EXPIRED)、`expires_at`；唯一 `(business, order_ref)` |
| `point_ledger` | `member_id`、`type`(EARN/CONSUME/RELEASE/REFUND/REVOKE/EXPIRE/ADJUST/MIGRATE)、`delta`、`balance_after`、`business`、`ref`、`allocations`、`idem_key` 唯一、`operator`、`created_at`；只追加 |
| `point_debt` | `member_id`、`amount`、`remaining`、`source_ref` |
| `outbox_event` | `id`、`type`、`member_id`、`version`、`payload`、`status`、`attempts`、`next_at` |
| `api_client` / `webhook_subscription` | 业务、`key_id`、密钥引用（不存明文）、IP 白名单、回调 URL |
| `api_nonce` | `key_id + nonce` 唯一，保留 10 分钟 |
| `adjustment_request`、`audit_log`、`recon_run`、`recon_diff`、`settlement_monthly` | 见第 7 节 |

不变量：

- 会员积分余额 = 所有 ACTIVE 批次的 `remaining` 之和 = 最新一条 `point_ledger.balance_after`，每日对账校验；
- 任何批次的 `remaining` 都在 0 到 `amount` 之间；
- 一期卡的 `refunded_cents ≤ paid_cents`；
- 已退卡的卡期不再产生新的权益使用记录。

## 9. 接口契约

**签名**

- 请求头：`X-Fy-Key`、`X-Fy-Timestamp`、`X-Fy-Nonce`、`X-Fy-Signature`、`Idempotency-Key`。
- 签名算法：`HMAC-SHA256(secret, method + "\n" + path + "\n" + timestamp + "\n" + nonce + "\n" + sha256(body))`。
- 时间窗 ±5 分钟；nonce 不得重复使用；仅允许 IP 白名单访问。

**错误码**：`INVALID_SIGNATURE`、`REPLAYED`、`IDEMPOTENCY_CONFLICT`、`MEMBER_NOT_FOUND`、`INSUFFICIENT_POINTS`、`POINTS_HOLD_EXPIRED`、`QUOTE_EXPIRED`、`AMOUNT_MISMATCH`、`CARD_NOT_REFUNDABLE`、`RULE_NOT_CONFIGURED`、`CRM_UNAVAILABLE`。

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/v1/members/resolve` | 识别或建档，返回会员与快照 |
| GET | `/v1/members/{id}/summary` | 年卡、积分余额、即将过期积分 |
| GET | `/v1/members/by-code/{code}` | 扫码查权益 |
| PUT | `/v1/members/{id}/profile` | 改资料（带 baseVersion） |
| POST | `/v1/members/{id}/deactivation` | 申请注销 |
| POST | `/v1/cards/quote`、`/v1/cards/issue` | 报价、开卡 |
| POST | `/v1/cards/benefit-usage`、`/v1/cards/benefit-usage/{id}/reverse` | 权益使用上报、冲减 |
| POST | `/v1/cards/{periodId}/refund-quote`、`refund/lock`、`refund/confirm`、`refund/abort` | 退卡 |
| POST | `/v1/points/earn`、`/v1/points/revoke` | 发放、撤回 |
| POST | `/v1/points/holds`、`/holds/{id}/confirm`、`/holds/{id}/release` | 预占、确认、释放 |
| POST | `/v1/points/refund` | 退款退回 |
| GET | `/v1/members/{id}/points/ledger` | 积分明细（顾客端展示来源业务） |

**webhook**

- 事件类型：`member.profile.changed`、`member.merged`、`member.deactivated`、`card.changed`、`points.changed`、`notify.requested`。
- 请求体：`{eventId, type, memberId, version, occurredAt, data}`，签名规则与上面相同。
- 业务端收到后返回 2xx 即视为成功；失败按 1/5/30 分钟、2/6/12/24 小时退避重试。
- 消费端按 `eventId` 去重；同一会员只接受 `version` 更大的事件。

## 10. 三端改造

| 业务 | 改造点 |
|---|---|
| 时叙 | `upsertCustomerByPhone` 后调 `resolve`，并保存 `crm_member_id`；`ProfileSyncProvider` 换成 CRM 实现；`annualDiscountCents` 改读本地 `crm_member_snapshot`；`customers.points`、`member_tier`、`member_until` 降为快照字段，不再作为权威；`prepareLines` 预占积分，`markPaid` 事务后通过出站任务确认积分 + 发放积分 + 上报权益使用，退款流程调 refund/revoke/reverse；新增年卡购买页、积分明细页；后台新增 webhook 接收端与 recon 接口 |
| 在场 | 登录调 `resolve`；`course_member_discounts` 新增 `FULLYU_ANNUAL` 会员类型，按 CRM 快照判定；`points_records` 停止写入、保留为历史；报名/订单抵扣改为预占→确认；`payment.service` 退款流程接 refund/revoke；补齐性别、生日字段；新增年卡购买入口、webhook、recon |
| 轻疗 | `CustomerService.login` 后调 `resolve`；`MemberCardService.purchase/adminRefund` 改为调 CRM 开卡、退卡；`MemberCardPriceEngine` 读快照中的折扣率；`s_integration` 停止新增，`jifenPayOrder`/`revocationIntegration` 改调 CRM；`c_customer_wx` 补 `customer_id` 关联；新增 webhook、recon；`/fully/open/**` 的固定 token 不复用 |

每个业务都新增两张本地表：`crm_member_snapshot`（会员 ID、年卡 JSON、积分余额、版本、`synced_at`）和 `crm_outbound_task`。这属于各业务自己新增的表，执行前需对该业务单独授权改 schema。

## 11. 迁移

所有步骤先在隔离副本上做演练（dry-run），产出报告；写入生产库需要单独授权，并在执行前做全库备份。

1. **身份**：导出三端用户，按手机号合并；unionId 与手机号指向不同人的、手机号格式不合法的，进入冲突清单，人工确认后再导入。
2. **积分**：
   - 轻疗：有效批次按原 `normal_score`、原 `end_time` 迁入（`MIGRATE` 流水）；
   - 在场：取每人最新 `balance`，以迁移日为 `earned_at` 生成一个批次；
   - 时叙：`points > 0` 的按在场方式处理。
   - 迁移前后逐人校验总额。
3. **年卡**：
   - 轻疗：卡期原样迁入，包括折扣快照；
   - 时叙：`member_tier=annual` 的转为卡期，`member_until` 为空的列入人工确认，不默认永久有效。
4. **切换顺序**：时叙 → 在场 → 轻疗。每个业务切换时有一个短暂只读窗口（停用积分抵扣和开卡），完成迁移 → 核对 → 切换开关 → 恢复；不做长期双写。每个业务保留一个回滚开关，可回到本地旧逻辑，但切换期间 CRM 上产生的流水需要人工回补。

## 12. 安全

- CRM 的密钥只放在环境变量或密钥管理里，不进源码、日志、截图。
- 本次核查发现轻疗 `application.yml`、在场 `apps/server/.env.local` 存有明文凭据，建议在接入 CRM 前轮换并迁出（单独授权）。
- 后台登录需要强密码 + 会话版本；生产后台限制访问来源。
- 对外接口不返回成本价和其他业务的订单明细；更新类接口使用字段白名单。

## 13. 验收

失败的测试先写，再实现到通过。证据分级沿用 [联调-验收-发布规范](../../rnd-playbook-2026-11-02/03-联调-验收-发布规范.md) 的 E0–E4。

- **规则**：10/31 23:59 与 11/01 00:00 获得的积分，到期日分别正确；跨年、闰年；退卡 7 天边界（第 7 天 23:59 / 第 8 天）、有过权益使用、建议额最低为 0、审批额超过建议额被拒。
- **并发**：同一余额两个业务同时预占，只有一个成功；同一订单重复开卡、重复发分，只生效一次；同键异内容返回 409。
- **乱序与重启**：webhook 乱序到达时旧版本被丢弃；预占超时后服务重启，仍能被释放；出站任务在 CRM 停机期间积压，恢复后补投，并且不重复入账。
- **结果未知**：开卡请求超时后重试同一幂等键，只得到一张卡；退卡时渠道结果未知，不调 confirm。
- **安全负向**：错误密钥、过期时间戳、重放 nonce、非白名单 IP 均被拒；客服角色不能审批；审批人不能是发起人；业务后台列表与详情不出现完整手机号（§16.1）。
- **降级**：CRM 停机时，展示正常、积分抵扣被明确拒绝、年卡快照 10 分钟边界行为正确。
- **迁移**：演练报告中三端积分总额与 CRM 一致，冲突清单数量与人工处理结果一致。
- **端到端（E3/E4，需真实渠道或真机，另行授权）**：在时叙买卡后，在场、轻疗立即看到；在轻疗用时叙发放的积分，对账报表中正确归集。

## 14. 分期

- **一期**：第 4–11 节全部内容 + CRM 后台 + SDK + 迁移工具。
- **二期**：标签与分群、人群导出（需审批）、统一优惠券（时叙/在场/轻疗三套券合并）、积分商城、会员等级与成长值、营销自动化。

## 15. 不适用与待核

- N/A：CRM 收款/退款通道（D4：哪里卖哪里收）；在场自有月/季/年卡的迁移（D2）。
- 待核（实施时验证，不需要经营决策）：
  - 三个小程序是否绑定同一个微信开放平台账号（决定 unionId 能否跨端使用）；
  - 各业务的订阅消息模板；
  - 轻疗生产库中是否已有年卡数据；
  - 在场 `RevenueSourceKey` 中 `ONSITE`（在场·到店收银）的实际含义。
- 需要经营决策、但不阻塞一期开发的事项：
  - 各业务积分获取的具体数值；
  - 年卡售价与有效天数；
  - 业务间年卡收入和积分负债的分摊比例。
  - 这些都在后台配置，或由财务另行确定。

## 16. 2026-11-08 补充（用户提出，demo 已按此实现）

### 16.1 手机号：CRM 明文，业务后台脱敏

- CRM 是会员资料的集中管理处，所有 CRM 角色看到明文手机号；打开会员档案时按「身份 + 会员」记一次「查看会员档案」审计。
- 时叙、轻疗、在场三个业务后台统一显示 `138****6620`（前 3 后 4）；只有单个会员的「拨打电话」动作取一次明文，并记审计。列表、详情、导出都不出现完整号码。
- CRM 导出默认脱敏；是否允许明文导出待定，若允许需审批。
- 这推翻了 §4 中「查看明文需 `crm:member:reveal`」和 §7 中「客服看脱敏数据」的旧口径，`crm:member:reveal` 权限取消。

### 16.2 会员资料与轨迹

- 资料：姓名、称呼、性别、生日（含年龄与本月生日）、城市、来源渠道、建档业务、标签、偏好备注、资料版本。
- 编辑资料需要 `crm:member:edit`；生日不能晚于今天。保存后版本 +1 并推送三端快照；推送失败的业务显示「快照落后」并等待补投；全程写审计（含改前 → 改后）。
- 轨迹：各业务最近登录、最近消费、首次消费、订单数，以及合并的最近动态（登录 / 消费 / 积分 / 礼物）。

### 16.3 消费与频次（口径）

- 消费 = 已支付订单，含购买大会员卡；金额为整数分，按业务汇总。
- 指标：距上次消费天数、近 3 个月次数、近 12 个月次数、平均间隔、累计消费、客单价、各业务占比、近 12 个月到访柱图。
- 人群（会员查询筛选和工作台「会员关怀」）：本月生日、30 天内来过、30–60 天未来、60 天以上未来（沉睡）、近 3 个月 ≥ 6 次（高频）。分群导出仍属二期。

### 16.4 积分调整统一在 CRM

- 单笔：需要 `crm:adjust:create`；单笔 ≤ 500 分直接入账，> 500 分进入待审批。
- 批量：需要 `crm:adjust:batch`；粘贴「会员号或手机号, ±分数」，逐行校验（找不到会员、格式、重复、扣减超余额），有错误不能提交；批量一律待审批。
- 审批：需要 `crm:approve:money`，审批人不能是发起人；驳回必须填写意见；审批时按当时余额重新校验，任一行不满足则整单不执行。
- 入账：加分新建一个总部批次，过期规则同 §6；扣减按到期最早优先。全部写 `ADJUST` 流水，只追加，并保持「批次合计 = 流水余额」。
- 500 分阈值是示例，进入积分配置。

### 16.5 权益卡

- **Full愈 大会员卡**：基础信息（卡名、编码、售价、有效天数、售卖渠道、三端权益规则）统一在 CRM 管理，需要 `crm:card:edit`。
  - 修改生成新版本，只追加；生效时间必须晚于今天；同一时间只能有一个「待生效」版本，生效前可撤销。
  - 新版本只对生效后的新购生效，已售卡期按开卡快照执行。售价 ¥699 / 365 天仍是示例。
- **业务会员卡**（在场课程卡、私教卡，轻疗疗程卡、储值卡等）：各业务系统自有，CRM 只同步并展示基础信息（卡名、卡号、类型、状态、有效期、余量、同步时间），不提供任何操作。
  - 开卡、核销、退卡都在业务系统完成；目录卡种以接入时各业务系统为准。
- 会员 360「权益卡」页签同时展示两类卡；同步延迟时标注。

### 16.6 新增权限

`crm:member:edit`、`crm:adjust:create`、`crm:adjust:batch`、`crm:card:edit`；取消 `crm:member:reveal`。demo 中的角色分配：

| 角色 | 权限 |
|---|---|
| OPS | 编辑资料、单笔与批量调整、编辑大会员卡 |
| CS | 编辑资料、单笔调整、发起换绑 |
| FINANCE | 审批调整，不能编辑资料和卡 |
| ADMIN | 全部权限 |

## 17. 交互 demo（2026-11-08）

总部 CRM 后台 demo 位于 `docs/crm-demo/`，单文件入口 `crm-admin.html`，覆盖工作台、会员查询与 360、积分调整、大会员卡与业务卡、审批中心、审计日志、三端同步、异常队列、规则配置、月度对账、角色权限。全部为合成数据，不连接任何系统，证据级别 E1（本地静态 demo），不代表接口、库表或权限已实现。进度与验证记录见 `docs/crm-demo/PROGRESS.md`。demo 中的数值（售价、费率、阈值、预算）仍是示例，以第 15 节待核项的经营结论为准。

## 18. 环境拓扑与三端接入（2026-11-08 确认）

### 18.1 现状

- 轻疗：`mall-test`（121.40.119.57）是独立测试环境；生产（8.133.6.18）尚未部署。
- 时叙：单实例 `teahour.fullyu.cn`，`NODE_ENV=staging`，但微信登录与汇付支付已是 live；尚未正式营业，顾客数据均为造数。
- 在场：单套环境，尚未正式营业，用户数据均为造数。
- 三端目前都没有真实用户。**身份母集取轻疗用户**；时叙与在场的造数不迁移，开业后按微信登录自然进入 CRM。

### 18.2 环境决策

- **不按业务拆 CRM 实例**。身份、积分、卡权益是唯一账本，拆实例会让同一个人分裂成多份。
- 现在只运行一套 **S1 准生产** CRM（MySQL、独立库、备份、真实密钥、审计全开、不提供清库入口）；本地 SQLite 只用于开发与测试。
- 轻疗测试连 S1，使用独立的 test 密钥；时叙与在场连 S1，使用各自 prod 密钥。轻疗测试会员与未来真实会员在同一账本内以「环境实例」隔离：正式上线时另建 CRM 生产实例 P，轻疗测试永远留在 S1，时叙/在场在开业时迁入 P，测试数据不迁。
- 每个业务每次请求带自己的 `business`，密钥与业务绑定；CRM 不信任请求体里自报的业务。

### 18.3 签名与幂等

- 请求头：`x-crm-key`（keyId）、`x-crm-timestamp`（Unix 秒）、`x-crm-signature`（hex）。
- 签名串：`timestamp + "\n" + METHOD + "\n" + originalUrl + "\n" + sha256hex(rawBody)`，用该 key 的 secret 做 HMAC-SHA256；`originalUrl` 含 `/api` 前缀与查询串。
- 时间窗 ±300 秒；密钥只在环境变量 `CRM_EXT_KEYS` 配置（`keyId → {business, secret}`），不入库、不进源码、不写日志。
- 写接口以业务侧业务单号 `ref` 幂等：`ext:{business}:{ref}`。同 ref 同内容返回原结果，同 ref 异内容 409；积分流水另有唯一幂等键兜底。

### 18.4 接口

| 方法与路径 | 说明 |
|---|---|
| `POST /api/external/members/resolve` | 按本地用户 id + unionId + 手机号解析/创建会员，返回会员号与余额 |
| `GET /api/external/members/:localUserId` | 查本业务用户的会员号、状态与余额 |
| `POST /api/external/members/import` | 批量导入（≤500），逐条幂等，返回新建/绑定/已存在/失败计数 |
| `POST /api/external/points/earn` | 加分，`points > 0`，带 `reason` 与 `ref` |
| `POST /api/external/points/consume` | 扣分，余额不足 422；按到期最早优先 |

### 18.5 身份匹配

1. 先按 `(business, localUserId)` 命中已有身份，直接返回该会员。
2. 否则按 `unionId` 找任一业务身份（unionId 存在身份上，一个会员可对应多个 App 的 unionId）；再按手机号找会员。
3. 两者命中不同会员 → 409 `IDENTITY_CONFLICT`，列出会员号，交人工合并，不自动合并。
4. 命中唯一会员 → 新增本业务身份并补齐 CRM 缺失资料；未命中 → 建会员（会员号 `FY-YYMM-000001` 按月递增）并写审计。
5. 外部只补空缺资料，不覆盖 CRM 已有值；手机号不是必填，先有 openId 也可建档。

### 18.6 推进顺序

1. CRM 对外签名接口（已完成，E1）。
2. 轻疗：导出客户 → 批量导入；登录与会员信息读 CRM 余额。
3. 时叙：顾客登录/资料接口以 CRM 为会员来源，积分只读展示；本地 Customer 继续承载订单关系。
4. 在场：用户登录/资料以 CRM 为会员来源，积分只读；`PointsRecord` 停写留到下一步。
5. 逐业务把积分写入切到 CRM（业务侧停写本地积分、每日对账不变量），再做卡权益与退卡。
6. 开业前建 CRM 生产实例 P，只迁真实用户；S1 保留测试。

### 18.7 边界

- CRM 不碰钱；支付、退款仍在各业务。
- 时叙/在场本地造数不迁移、不清理（由业务方在开业前自行决定重置）。
- 真实微信 unionId 是否跨三个小程序统一，取决于是否绑定同一微信开放平台账号；未统一时以手机号为跨业务关联键，unionId 只在同一 App 内可靠。

