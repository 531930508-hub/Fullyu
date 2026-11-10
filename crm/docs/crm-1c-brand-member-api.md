# CRM 1C · 品牌会员签名接口（本地 E1）

日期：2026-11-08
范围：`/api/v1/brand-member/*`、X-Fy 签名与 nonce、会员品牌卡期、报价/开卡、愈行之旅票据。
边界：本地 SQLite、合成数据、未部署、未接真实支付；三端仍为 mock。真实扣款、发布与生产库变更均未授权。

## 1. 身份与签名

- 会员身份：签名密钥绑定业务（`sx / ql / zc`），请求只传本业务 `localUserId`；手机号与会员号不出现在 URL。
- 请求头：`X-Fy-Key`、`X-Fy-Timestamp`、`X-Fy-Nonce`、`X-Fy-Signature`，写接口另有 `Idempotency-Key`。
- 签名串：`timestamp\nnonce\nMETHOD\n完整路径（含 /api 与查询串）\nsha256hex(rawBody)`，HMAC-SHA256(secret)。
- 时间窗 ±300 秒；nonce 8–128 位，落 `api_nonces`，10 分钟内同 key + nonce 复用返回 `409 REPLAYED`；过期记录随手清理。
- 密钥只从 `CRM_EXT_KEYS` 注入，不入库、不进源码；未配置时拒绝所有外部请求。
- `business` 参数缺省取密钥业务；与密钥不一致返回 `403 BUSINESS_MISMATCH`。

## 2. 数据模型

| 表 | 用途 | 关键约束 |
|---|---|---|
| `member_brand_cards` | 会员品牌卡期与开卡版本快照 | `(sold_by, order_ref)` 唯一；价格/权益/积分模式随版本冻结 |
| `brand_card_quotes` | 30 分钟一次性报价 | 绑定会员、业务、密钥、版本与价格；`used_at` 条件占用 |
| `api_nonces` | 签名防重放 | `(key_id, nonce)` 主键 |
| `member_game_states` | 骰子、站点、当月获得 | 会员唯一 |
| `game_tickets` | 愈行之旅短票据 | 只存 SHA-256；5 分钟有效 |

## 3. 接口

| 方法与路径 | 状态码 | 说明 |
|---|---|---|
| `GET /v1/brand-member/me` | 200 | 身份、卡期、积分、骰子、权益、游戏 URL；无卡返回 `card.state=NONE` |
| `GET /v1/brand-member/products` | 200 | 当前生效版本的价格/天数/权益/积分模式 |
| `POST /v1/brand-member/quote` | 201 | 报价 30 分钟；未知会员 404 `MEMBER_NOT_FOUND`，未知产品 404 `PRODUCT_NOT_FOUND` |
| `POST /v1/brand-member/issue` | 201 | 金额不符 409 `AMOUNT_MISMATCH`；报价过期/已用 409 `QUOTE_EXPIRED`；订单号冲突 409 `IDEMPOTENCY_CONFLICT` |
| `POST /v1/brand-member/game/ticket` | 201 | 有效品牌卡才可换；未开卡 403 `GAME_UNAVAILABLE`；未配置地址 503 |

## 4. 不变量

1. 报价金额来自激活版本，业务端传入的金额只用于一致性校验，不参与定价。
2. 开卡快照版本的价格、有效期、权益、积分模式；之后改价或新建版本不影响已购卡。
3. 已生效卡存在时，续费从旧卡 `validUntil` 次日开始，状态 `PENDING`，不覆盖旧卡；`me` 同时返回当前卡与 `pendingCard`。
4. 状态按日期实时计算：`PENDING`、`ACTIVE`、`EXPIRING`（≤30 天）、`EXPIRED`；退款锁/已退来自库内状态。
5. 同一 `orderRef` 只开一张卡：幂等键 + 数据库唯一约束双重兜底；崩溃后重试返回原卡。
6. 报价一次性：`used_at` 由条件更新抢占，并发重复使用只有一方成功。
7. 游戏票据只存哈希，URL 不含会员号/手机号；票据由 CRM 签发，H5 换会话属后续批次。
8. `businessCards`、`savedCents`、奖品待领数没有可靠来源时返回空数组/0，不编造业务数据。

## 5. 已知边界

- 未实现：`game/roll` 与骰子规则、奖品核销、outbox/webhook、快照落后补偿、对账异常队列。
- 在场畅练卡与轻疗历史卡的会员级卡期尚未进入 CRM，`businessCards` 暂为空；1F 需要业务端上报或只读快照。
- `/api/external/*`（身份/积分）沿用 `x-crm-*` 旧签名，品牌会员使用 `X-Fy-*`；三端接入时需按接口分别实现，统一签名方案留待 1F。
- 没有限流与密钥轮换；生产前补齐。

## 6. E1 证据（2026-11-08）

- Jest：42/42 通过（品牌会员 11 个用例：签名负向与 nonce 重放、脱敏身份、业务隔离、无卡会员、产品目录、报价校验、金额不符、开卡幂等、续费 PENDING、报价过期、票据哈希）。
- `pnpm lint`、`pnpm build:server` 通过。
- 3310 端口真实 HMAC 冒烟：`me`（林小满年卡 2026-10-30 → 2027-10-29、积分 500、骰子 12/8）、产品目录、报价、金额不符 409、开卡 2026-11-08 → 2027-11-07、同幂等键重放同 `cardId`、票据 201、nonce 重放 409、无卡会员 `NONE`/游戏关闭。
- 冒烟后已 `db:seed` 恢复干净状态；未提交、未部署。
