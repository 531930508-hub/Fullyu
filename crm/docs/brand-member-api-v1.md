# Full愈品牌会员 · 三端接口契约 v1（本地联调版）

日期：2026-11-08
状态：三端 UI 与本地 mock 依据；**CRM 1B（产品/版本/业务卡目录）与 1C 品牌会员签名接口已于本地实现，骰子规则与 game/roll 尚未实现**。本文是联调契约，不是上线或真实开卡授权。

## 1. 产品口径

| 项目 | 结论 |
|---|---|
| 品牌卡 | 沿用「Full愈年卡」名称，全品牌通用；年卡 ¥299 / 365 天，月卡 ¥45 / 30 天（价格由 CRM 配置，前端只展示报价） |
| 售卖 | 时叙、在场、轻疗三端都可买；收款在各业务自有商户，CRM 不碰资金 |
| 权益 | 按业务配置：时叙每杯立减、轻疗提前/当日预约折扣、在场课程会员价 |
| 积分 | CRM 唯一账本；轻疗支付时 1 分 = 1 元；时叙、在场本期只展示，不开放消耗 |
| 骰子/游戏 | CRM 记骰子与进度；三端统一打开 CRM 的「愈行之旅」H5（web-view） |
| 在场自有卡 | 保留在在场系统，产品名「在场畅练卡」，权益是有效期内免费上课；不并入 CRM 卡期 |
| 价格优先级 | 在场课程：畅练卡免费 > 品牌年卡会员价 > 原价；不叠加 |

在场两张卡必须分开展示、分开购买、分开核销。CRM 只读展示在场畅练卡，不修改其有效期。

## 2. 通用约定

- 业务标识 `business`：`teahour`（时叙）、`presence`（在场）、`retreat`（轻疗）。
- CRM 内部业务键为 `sx / ql / zc`，对外契约使用上面的英文键；1B 目录响应同时返回 `business` 与 `businessKey`。三端不得各自维护第二套映射。
- 金额一律整数分；积分、骰子为整数。
- 三端调用 CRM 使用签名头：`X-Fy-Key`、`X-Fy-Timestamp`、`X-Fy-Nonce`、`X-Fy-Signature`、`Idempotency-Key`。
- 签名串：`timestamp\nnonce\nMETHOD\n完整路径（含 /api 与查询串）\nsha256hex(rawBody)`，secret 做 HMAC-SHA256；时间窗 ±300 秒，nonce 10 分钟内不可复用。
- 会员身份用本业务 `localUserId` 定位，不传手机号或会员号，避免 PII 进入 URL、日志与截图；跨业务读取返回 `BUSINESS_MISMATCH`。
- CRM 不可用：身份页显示本地快照并标注「更新于 HH:mm」；购买、掷骰、积分抵扣失败关闭，不伪造成功。
- 前端不信任传入的积分数、骰子数、权益金额；只消费 CRM 返回值。

## 3. 读取品牌会员身份

`GET /v1/brand-member/me?business={business}&localUserId={本业务用户id}`

```json
{
  "member": {
    "memberNo": "FY-2026-008812",
    "name": "林小满",
    "phoneMasked": "138****6620"
  },
  "card": {
    "state": "ACTIVE",
    "productCode": "FY_ANNUAL",
    "productName": "Full愈年卡",
    "priceCents": 29900,
    "validFrom": "2026-10-30",
    "validUntil": "2027-10-29",
    "remainingDays": 356,
    "soldBy": "retreat",
    "soldByName": "轻疗"
  },
  "points": {
    "balance": 1280,
    "expiring": 120,
    "expireAt": "2027-01-01",
    "spend": { "teahour": "display_only", "presence": "display_only", "retreat": "1_point_1_yuan" }
  },
  "dice": { "balance": 12, "station": 8, "monthlyEarned": 12 },
  "prizes": { "pending": 1 },
  "savedCents": 8600,
  "notices": [
    {
      "id": "MN-...",
      "title": "冬季会员礼遇",
      "body": "十二月起到店可试饮新一季的桂圆红枣茶。",
      "pinned": true,
      "store": "上海·徐汇店",
      "coverUrl": "https://cdn.example.com/notice-winter.jpg",
      "expireAt": "2026-12-31",
      "publishedAt": "2026-11-09"
    }
  ],
  "benefits": [
    { "business": "teahour", "title": "时叙 · 每杯立减", "desc": "每杯立减 ¥2，具体以 CRM 配置为准" },
    { "business": "retreat", "title": "轻疗 · 项目会员价", "desc": "提前预约 7.8 折，当日 8.8 折" },
    { "business": "presence", "title": "在场 · 课程会员价", "desc": "课程会员价，具体以在场课程配置为准" }
  ],
  "businessCards": [
    {
      "business": "presence",
      "type": "PRESENCE_PASS",
      "name": "在场畅练卡",
      "state": "ACTIVE",
      "validUntil": "2026-12-31",
      "remainingDays": 53,
      "benefit": "有效期内课程免费",
      "managePath": "/pages/member/index"
    }
  ],
  "game": {
    "enabled": true,
    "dice": 12,
    "url": "https://crm-test.fullyu.cn/game/?embed=1&host=teahour&ticket=..."
  },
  "updatedAt": "2026-11-08T10:42:00+08:00",
  "stale": false
}
```

### 状态

`card.state`：`NONE` | `PENDING` | `ACTIVE` | `EXPIRING` | `EXPIRED` | `REFUND_LOCKED` | `REFUNDED`

- `EXPIRING`：剩余天数 ≤ 30，前端显示续费提示。
- `PENDING`：续费已支付、尚未生效，显示新卡期开始日。
- 未登录也返回 `NONE`，不返回空对象，避免前端把失败当空数据。

1C 实现补充：响应 `card` 另带 `cardId`；已有生效卡且又有续费时，`card` 是当前卡，`pendingCard` 是待生效卡。`savedCents` 尚无账本来源，暂返回 0；`businessCards` 暂返回 `[]`，CRM 1C 尚未收到在场畅练卡/轻疗历史卡的会员级卡期快照，不以目录冒充持卡。`game.url` 在 `CRM_GAME_URL` 未配置时为 `null`，不伪造可玩。

## 3.1 产品目录

`GET /v1/brand-member/products`

返回当前生效的产品与版本：`{ products: [{ code, name, priceCents, validDays, benefits, pointsSpend, gameEnabled }] }`。前端只展示，价格以下单时的报价为准；新版本激活后目录立即变化，已购卡期不受影响。

## 3.2 会员公告（业务端黑板报）

`GET /v1/brand-member/me` 的 `notices` 字段，仅在会员卡有效（`ACTIVE` / `EXPIRING` / `PENDING`）时返回；非会员、退卡与已到期会员返回空数组，不泄露门店公告。

| 字段 | 说明 |
| --- | --- |
| `id` | 公告 id |
| `title` / `body` | 标题与正文；正文保留换行 |
| `pinned` | 是否置顶；排序时置顶优先 |
| `store` | 门店名，空串表示全部门店 |
| `coverUrl` | 封面图，HTTPS 地址；空串表示纯文字纸条 |
| `expireAt` | 展示截止日 `YYYY-MM-DD`，当天 23:59:59（+08:00）前可见；`null` 表示长期 |
| `publishedAt` | 首次发布时间 `YYYY-MM-DD` |

规则：

- `business` 为 `all` 或当前业务才下发；
- 只下发 `PUBLISHED` 且未过期的公告，按 `pinned DESC, publishedAt DESC` 排序，最多 20 条；
- 后台保存时封面只接受 `https://` 地址；已过期公告不能重新发布，需先修改有效期。

## 4. 报价与开卡（本地 mock 只实现报价/开卡的成功路径）

`POST /v1/brand-member/quote`

```json
{ "business": "teahour", "localUserId": "本业务用户 id", "productCode": "FY_ANNUAL" }
```

返回 `{ "quoteId": "BCQ-...", "productCode": "FY_ANNUAL", "priceCents": 29900, "validDays": 365, "expiresAt": "..." }`。报价 30 分钟有效、一次性使用；`business` 必须与密钥一致。

`POST /v1/brand-member/issue`

```json
{ "quoteId": "q_...", "orderRef": "teahour:order:...", "paidCents": 29900, "paidAt": "2026-11-08T10:42:00+08:00" }
```

- 幂等键：请求头 `Idempotency-Key`，缺省用 `{business}:brand-card:issue:{orderRef}`。
- `paidCents` 与报价不一致返回 `409 AMOUNT_MISMATCH`，不擅自按其他金额开卡。
- 支付成功后由业务端调用；CRM 返回新卡期。已有生效卡时新卡为 `PENDING`，从旧卡结束次日开始，不覆盖旧卡。
- 同一 `orderRef` 不重复开卡；不同金额或不同会员复用订单号返回 `409 IDEMPOTENCY_CONFLICT`。

## 4.1 退卡（CRM 只撤销卡权，资金由业务端原路退回）

`POST /v1/brand-member/refund`

```json
{
  "orderRef": "retreat:order:...",
  "cardId": "MBC-...",
  "refundCents": 29900,
  "refundType": "WITHIN_7D",
  "reason": "客户申请退卡",
  "refundedAt": "2026-11-08T10:42:00+08:00"
}
```

- `orderRef` 与 `cardId` 至少给一个；同时给出时必须指向同一张卡。CRM 按 `(soldBy, orderRef)` 定位，找不到返回 `404 CARD_NOT_FOUND`，跨业务调用返回 `403 BUSINESS_MISMATCH`。
- `refundType`：`WITHIN_7D`（支付 7 天内）或 `AFTER_7D`（超过 7 天；旧值 `PRORATED` 仍接受为别名）。金额必须先取 `GET /v1/brand-member/refund-quote`（见 §9.2），`refundType` 与 `refundCents` 必须与 CRM 按 `refundedAt` 重算的试算结果**完全一致**，否则 `409 REFUND_AMOUNT_MISMATCH`（`details` 带最新试算）；试算 `allowed=false` 返回 `409 REFUND_NOT_ALLOWED / CARD_NOT_REFUNDABLE`，不应调用本接口。
- 幂等：请求头 `Idempotency-Key`，缺省用 `{business}:brand-card:refund:{orderRef}`。已退卡再次以相同金额/类型请求返回原结果；金额或类型不同返回 `409 IDEMPOTENCY_CONFLICT`。
- 成功后卡 `state=REFUNDED`，记录 `refundType / refundCents / refundedAt / refundReason`，`me` 不再返回该卡，游戏入口同步失效；写审计「外部退卡」与 `brand_card.refunded` outbox 事件。
- 资金退款失败时业务端不应先撤 CRM 卡；轻疗端在退款成功后调用本接口，CRM 不可用时保留待补偿状态并自动重试。

## 5. 愈行之旅

游戏由 CRM 托管，三端用 web-view 打开 `game.url`。`ticket` 一次性、短时效（5 分钟），由 `POST /v1/brand-member/game/ticket` 换取；CRM 只存票据哈希，不在 URL 暴露会员号或手机号。`me` 在有效品牌卡下也会返回带票据的 URL。

正式会话（2026-11-09 实现）：小程序 web-view 打开带 `ticket` 的游戏地址，页面以 `POST /api/v1/brand-member/game/exchange` 换短期会话，之后：

- `GET /api/v1/brand-member/game/session` → `{ member, business, board:{ stations, chestStations:[3,7,11], lapLength:12, lap, cells }, rule:{ centsPerDie, checkinDaily, guestPlay }, progress, dice, prizes }`。
- `POST /api/v1/brand-member/game/session/roll` → `{ dice, station, lap, balance, points, prize, board:{ lap, cells } }`。点数、落点、积分与券都由服务端结算，前端只播动画。
- `cells` 每站一项：`{ station, kind:'points', points }` 或 `{ station, kind:'voucher', prizeIndex, name, business }`；只在停留站发放，路过不发；跑完一圈按新圈档位重新生成。
- 体验券只有免费体验（不发折扣券），到店由店员在后台确认核销；概率不对会员展示。

非会员：可浏览地图与奖品，不能掷骰；开通年卡后可玩。

## 6. 在场双卡

- 品牌卡：CRM 卡期，在场权益 = 热门课优先排位 + 课程阶梯价（卡版本 `perks.presence`）+ 每月邀请好友。
- 在场畅练卡：在场自有卡期，权益 = 有效期内 0 元报课；有效期内附赠同期品牌会员（§9.5），附赠资格不可退款。
- 在场畅练卡页面不展示年卡信息；只有畅练卡快到期或没有畅练卡时才露出年卡入口。
- 课程详情/结算：
  1. 有有效畅练卡 → 免费；
  2. 否则有有效品牌年卡 → 课程会员价；
  3. 否则原价。
- 服务端必须同时校验两种资格，不能只信前端展示；品牌资格以 CRM 返回或快照（10 分钟内）为准。
- 文案：品牌卡称「Full愈年卡」，在场卡称「在场畅练卡」；不使用裸「会员」指代任一产品。

## 7. 错误码

`INVALID_SIGNATURE`、`REPLAYED`、`IDEMPOTENCY_CONFLICT`、`MEMBER_NOT_FOUND`、`QUOTE_EXPIRED`、`AMOUNT_MISMATCH`、`CARD_NOT_REFUNDABLE`、`GAME_UNAVAILABLE`、`CRM_UNAVAILABLE`。

2026-11-09 新增：`ORDER_NOT_FOUND`、`CARD_NOT_FOUND`、`BUSINESS_MISMATCH`、`ALREADY_REFUNDED`、`REFUND_NOT_ALLOWED`、`REFUND_AMOUNT_MISMATCH`、`GIFT_CODE_INVALID`、`GIFT_CODE_PAUSED`、`GIFT_CODE_EXPIRED`、`GIFT_CODE_FULL`、`MEMBERS_ONLY`、`FEEDBACK_RATE_LIMIT`、`INVITE_INVALID`、`INVITE_USED`、`INVITE_SELF`、`INVITE_EXPIRED`、`INVITE_ALREADY_CLAIMED`、`INVITE_QUOTA_EXCEEDED`、`PRODUCT_NOT_FOUND`。

## 8. 本地 mock

三端各有一个 `brandMember` 适配层，默认 `mode: 'mock'`：

- 返回合成会员「林小满 / FY-2026-008812」，年卡生效中，积分 1,280，骰子 12，在场畅练卡生效中。
- 开卡、掷骰只更新内存状态，刷新后回到初始值。
- 生产构建必须把 `mode` 切到 `crm`，并配置 CRM 地址与签名密钥；本期未做。
- CRM 1C 本地接口已可按本契约联调（`X-Fy-*` + nonce）；三端切换与真机联调属 1F，未获授权前保持 mock。

## 9. 会员运营接口（2026-11-09 会议落地）

均走 `X-Fy-*` 签名；`business` 取自密钥；`localUserId` 为本业务用户 id；时间为 ISO 8601（`+08:00`），金额为整数分。经营口径见 [年度大会员决策](2026-11-09-annual-member-decisions.md)。

### 9.1 订单上报（净消费 / 节省 / 骰子）

`POST /v1/brand-member/orders/report`

```json
{ "localUserId": "u1", "orderRef": "ql:order:C2026...", "paidCents": 36600, "savedCents": 1000, "occurredAt": "2026-11-09T14:00:00+08:00" }
```

- `paidCents` 为扣除全部优惠后的实付；`savedCents` 为会员权益带来的节省（非会员下单时 CRM 记 0）。
- 下单时有生效品牌卡且卡可玩游戏，才按「实付 + 上次零头」每满 `centsPerDie` 发骰子；不设单笔与每月上限。
- 幂等：`(business, orderRef)`；同额重放返回原结果 `replayed=true`，改金额或会员返回 `409 IDEMPOTENCY_CONFLICT`。
- 返回 `{ order, dice:{ earned, balance, capped, replayed } | null, progress, replayed }`；`progress.headline` 即「再消费 ¥X 可再得一次游戏机会」，余额为负时 X 已含补回欠账所需金额。

`POST /v1/brand-member/orders/refund`：`{ localUserId, orderRef, refundCents, occurredAt }`，`refundCents` 为该订单**累计已退**金额。按比例冲回节省；每次新增退款都按每颗 `centsPerDie` 收回骰子（不足时继续扣结转，可扣成负数；之后所得的骰子先抵欠账）。累计值变小返回 `409`，原单未上报返回 `404 ORDER_NOT_FOUND`。

### 9.2 退卡试算

`GET /v1/brand-member/refund-quote?orderRef=...`（或 `cardId=`）

返回 `{ cardId, source, window, refundType, paidCents, savedCents, redeemedGiftCents, refundableCents, allowed, reasonCode, message, windowEndsAt }`：

- 7 天内：`实付 − 已领实物礼`；超过 7 天：`实付 − 已享优惠 − 已领实物礼`；≤0 时 `allowed=false`、`reasonCode=REFUND_NOT_ALLOWED`，`message` 为挽留文案。
- 赠送卡（`GIFT`）、畅练卡附赠（`BUNDLE`）恒为 `CARD_NOT_REFUNDABLE`。
- 业务端先试算 → 原路退款 → 用同一 `refundType/refundCents` 调 §4.1。CRM 不可用时业务端不应自行计算金额。

### 9.3 赠送会员码

`POST /v1/brand-member/gift/claim`：`{ localUserId, code }`（4–16 位大写字母或数字，忽略空格）。

- 成功发一张 `FY_GIFT` 卡（权益取年卡现行版本，接在已有卡期之后），返回 `{ card, days, replayed }`；同一会员重复领取返回原卡。
- 失败：`GIFT_CODE_INVALID`（不存在/待审批/已驳回）、`GIFT_CODE_PAUSED`、`GIFT_CODE_EXPIRED`、`GIFT_CODE_FULL`（界面显示「已满」）。
- 码由后台「会员码」创建：名称、渠道标签、推荐人（STAFF / THERAPIST / PARTNER）、天数（默认 30，>30 天进入待审批且发起人不能自审）、名额（留空不限）、领取截止日。

### 9.4 意见反馈与会员故事（仅有效品牌会员）

- `POST /v1/brand-member/feedback`：`{ localUserId, content(5–1000 字), allowQuote }`；每人每天最多 5 条（`429 FEEDBACK_RATE_LIMIT`）。
- `GET /v1/brand-member/stories?localUserId=...`：返回已发布故事 `{ stories:[{ id, title, quote, quoteBy, story, business, publishedAt }] }`。只有会员勾选 `allowQuote` 的反馈才能关联成故事。

### 9.5 在场：畅练卡附赠与邀请好友（仅在场密钥）

- `POST /v1/brand-member/bundle`：`{ localUserId, passRef, validFrom, validUntil }`（日期 `YYYY-MM-DD`）。畅练卡有效期内附赠同期品牌会员（`FY_BUNDLE`）；续期以同一 `passRef` 重新上报，日期不变视为重放。
- `POST /v1/brand-member/bundle/revoke`：`{ localUserId, passRef, reason }`，畅练卡退卡时撤销附赠资格（不涉及退款）。
- `GET /v1/brand-member/invites?localUserId=...` → `{ monthKey, quota, used, remaining, invites }`；`quota` 取卡版本 `perks.presence.invitesPerMonth`。
- `POST /v1/brand-member/invites/create`：`{ localUserId }` → `{ code, remaining, expiresAt }`，邀请 30 天有效，超额 `409 INVITE_QUOTA_EXCEEDED`。
- `POST /v1/brand-member/invites/claim`：`{ localUserId, code }` → `{ claimed, replayed, voucher:{ kind:'PRESENCE_FREE_CLASS', ... } }`；CRM 只记关系与归因，体验课券由在场发放。每位被邀请人限领一次，不能自领。
