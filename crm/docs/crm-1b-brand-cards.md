# CRM 1B：大会员卡产品与版本

日期：2026-11-08
状态：本地 E1 完成（SQLite 合成数据）；未接三端、未接支付、未部署。

## 1. 本批边界

- 做：品牌卡产品与不可变版本、生效版本状态机、权限与审计、集成测试。
- 不做：会员开卡/续费/退款、报价与外部签名接口（1C）、骰子与游戏账本（1D）、后台页面（1E）、三端切换（1F）。
- 资金的收款仍在各业务商户；CRM 不碰资金，也不接管在场畅练卡的卡期与核销。

## 2. 数据模型

| 表 | 作用 | 关键约束 |
|---|---|---|
| `brand_card_products` | 产品主档（`FY_MONTH`、`FY_ANNUAL`） | 编码唯一；`current_version` 指向当前生效版本 |
| `brand_card_versions` | 不可变版本：价格、有效期、权益、积分模式、游戏开关 | `(product_code, version)` 唯一；状态 `DRAFT / ACTIVE / ARCHIVED` |

已生效版本不提供修改接口。改价或改权益必须新建草稿版本再激活；旧版本自动归档，历史报价与已开卡仍可追溯。

## 3. 状态机与不变量

1. 新建版本始终为 `DRAFT`，不影响 `current` 价格与权益。
2. 激活时同一事务内：条件更新目标 `DRAFT → ACTIVE`、其他 `ACTIVE → ARCHIVED`、产品 `current_version` 指向新版本。
3. 只有 `DRAFT` 可激活；重复激活或回滚归档版本返回 409。
4. 产品归档后不能新增或激活版本。
5. 激活写入审计（操作人、产品、版本、价格、天数）。
6. 业务编码在 CRM 内部为 `sx / ql / zc`，对外契约为 `teahour / retreat / presence`。

## 4. 接口（员工鉴权，前缀 `/api`）

| 方法与路径 | 权限 | 说明 |
|---|---|---|
| `GET /brand-cards` | `crm:card:view` | 产品列表、当前版本、全部版本 |
| `GET /brand-cards/:code` | `crm:card:view` | 单产品详情 |
| `POST /brand-cards` | `crm:card:edit` | 新建产品 |
| `POST /brand-cards/:code/versions` | `crm:card:edit` | 新建草稿版本 |
| `POST /brand-cards/:code/versions/:version/activate` | `crm:card:edit` | 激活版本 |

角色模板：管理员全部；会员运营可看可维护；财务、客服只读。

## 5. 校验口径

- 产品编码 `^FY_[A-Z0-9_]{2,30}$`。
- 价格 1–10,000,000 分；有效期 1–3650 天。
- 权益 1–3 条，业务不重复；标题 1–40 字、说明 ≤120 字。
- 积分模式仅 `display_only` 或 `1_point_1_yuan`；业务键接受内部值与对外契约值。
- 版本备注 ≤200 字。

## 6. 种子

- `FY_MONTH`：Full愈月卡，¥45 / 30 天，v1 生效。
- `FY_ANNUAL`：Full愈年卡，¥299 / 365 天，v1 生效，三条权益；积分在轻疗端单独展示，会员卡页不重复呈现。

## 7. E1 证据（2026-11-08）

- `pnpm test`：版本状态机、校验、产品创建与权限用例通过。
- `pnpm --filter @fullyu/crm-server lint`：通过。
- `pnpm build:server`：通过。
- 本地启动冒烟：读取年卡 29900 分 / 365 天 / 3 条权益；客服建版本 403；月卡草稿 v2 → 激活 201（旧版 ARCHIVED）→ 重复激活 409；审计 1 条。冒烟后重新 seed。
- 未测：真实 MySQL、并发激活压测、1C 签名接口、三端联调、后台页面。

## 8. 下一步（1C）

- 对外 `/v1/brand-member/*` 签名接口：会员身份解析、报价、开卡幂等、游戏票据。
- 会员品牌卡期的持久化与状态机（`ACTIVE / EXPIRING / PENDING / EXPIRED / REFUND_*`）。
- 与 1B 版本绑定报价，避免激活新版本时影响已生成报价。
