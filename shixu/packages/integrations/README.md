# @teahour/integrations — 时叙对外接口对接包

这个包是**对接团队唯一需要改动的区域**。业务系统（门店营业、订单、财务、库存、权限、报表）只依赖这里的接口类型，不依赖任何厂商 SDK。对接团队在这个包里实现真实渠道，不会和业务代码产生冲突。

```
packages/integrations/src/
├── contracts.ts              业务与外部服务商之间唯一的类型约定（改它要先和后端负责人确认）
├── config.ts                 环境变量 → 配置
├── factory.ts                mock / live 装配，缺实现时启动即报错
├── providers/
│   ├── mock/                 内置模拟实现（本地开发、验收、回归测试用）
│   └── live/
│       ├── index.ts          ★ 真实实现的唯一注册点
│       └── payment.example.ts 支付渠道骨架示例（不参与运行）
└── index.ts                 包出口
```

后端只有一层薄胶水：`apps/server/src/hardware/hardware.module.ts`（约 45 行），它把装配好的能力原样暴露给业务服务。**除这个文件外，业务侧不需要改任何一行代码。**

---

## 1. 运行模式

| 模式 | 触发方式 | 行为 |
| --- | --- | --- |
| `mock`（默认） | `INTEGRATIONS_MODE` 为空、`mock`、`dev`、`local` | 全部使用 `providers/mock` 的内置实现：不扣款、不打印、不调微信 |
| `live` | `INTEGRATIONS_MODE=live`（`prod`/`production` 等价） | 每项能力都必须已在 `providers/live/index.ts` 注册真实实现 |

`live` 模式下**缺任何一项都会在进程启动时直接抛错退出**，不会静默回落到 mock。这是刻意的：线上"看起来接好了、其实没扣款"比启动失败危险得多。

```bash
# 本地开发：什么都不用配
pnpm --filter @teahour/server dev

# 预发/生产：8 项必须全部注册
INTEGRATIONS_MODE=live pnpm --filter @teahour/server start
```

### 1.1 单渠道切 live（登录 / 支付互不影响）

汇付天下支付与微信登录都支持按渠道覆盖。支付转 live 只影响收款，不影响登录；
反之登录转 live 也不会让 mock 支付冒充真实扣款（客户端以 `prepayMode` 判断）。

### 1.2 微信登录单独接 live（支付仍为 mock）

微信登录与手机号可以先用渠道覆盖单独接入真实接口，其余渠道（尤其支付）继续保持 mock：

```bash
INTEGRATIONS_WECHAT_MODE=live
WECHAT_APPID=wx...
WECHAT_APPSECRET=...
```

此时 `wechat.mode=live`，但 `wechat.prepayMode` 仍等于 `INTEGRATIONS_PAYMENT_MODE`（默认 `mock`）。
prepay 接口会同时返回 `mode` 与 `prepayMode`，客户端必须以 `prepayMode` 判断支付参数是否真实，
不能因为登录已接真实就调用 `wx.requestPayment`。支付转 live 需另行完成商户号与证书接入。

## 2. 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `INTEGRATIONS_MODE` | 生产必填 | `mock` \| `live`，其他值启动即报错 |
| `INTEGRATIONS_<CHANNEL>_MODE` | 否 | 按渠道覆盖，如 `INTEGRATIONS_WECHAT_MODE=live` |
| `INTEGRATIONS_ENV` | 否 | 环境标识（如 `staging`、`prod-sh`），只用于状态展示 |
| `WECHAT_APPID` | 否 | 小程序 AppID，默认 `wxd9e4e4568d1bc8bb` |
| `WECHAT_APPSECRET` | 微信 live 必填 | 小程序密钥，用于 `jscode2session` 与 `getuserphonenumber` |
| `WECHAT_MCHID` | live 必填 | 微信支付商户号 |
| `INTEGRATIONS_PAYMENT_MODE` | 否 | `live` 时收款走汇付天下；未配置则跟随 `INTEGRATIONS_MODE` |
| `HUIFU_SYS_ID` | 汇付 live 必填 | 服务商编号 `sys_id` |
| `HUIFU_PRODUCT_ID` | 否 | 产品号，默认 `PAYUN` |
| `HUIFU_HUIFU_ID` | 汇付 live 必填 | 默认子商户号（未在门店映射里单独配置的门店使用） |
| `HUIFU_STORE_MERCHANTS` | 否 | 门店子商户映射 JSON：`{"门店ID":"子商户号"}` |
| `HUIFU_SUB_APPID` | 否 | 小程序 AppID，默认取 `WECHAT_APPID` |
| `HUIFU_PRIVATE_KEY_PATH` | 否 | 商户 RSA 私钥，默认 `/etc/teahour/huifu/merchant_private_key.pem` |
| `HUIFU_PUBLIC_KEY_PATH` | 否 | 汇付 RSA 公钥，默认 `/etc/teahour/huifu/huifu_public_key.pem` |
| `HUIFU_WEBHOOK_KEY_PATH` | 否 | 回调密钥，默认 `/etc/teahour/huifu/webhook.key` |
| `HUIFU_NOTIFY_URL` | 否 | 异步通知地址，默认 `https://teahour.fullyu.cn/api/hooks/payment/huifu-payment` |
| `HUIFU_API_BASE` | 否 | 默认 `https://api.huifu.com`（联调可指向沙箱） |
| `HUIFU_TIMEOUT_MS` | 否 | 渠道 HTTP 超时，默认 15000，限制 3000–60000 |

厂商自己的凭证（打印服务 token、泡茶机密钥、对象存储 AK/SK 等）由对接团队自行命名，建议在 `providers/live/` 内通过 `ctx.config` 或 `process.env` 读取，并同步更新本节表格。

## 3. 八项能力清单

| key | 接口 | 业务调用点 | 当前状态 |
| --- | --- | --- | --- |
| `payment` | `PaymentGateway` | 下单收款 `orders.service.ts`、退款、回调 `api/hooks.controller.ts` | 汇付天下（斗拱 v2）已实现：小程序 JSAPI、收款码正扫、付款码反扫、退款、异步通知；默认仍是 mock |
| `printer` | `LabelPrinter` | 杯贴打印 `printing.service.ts:74`、设备状态 `losses.service.ts:322` | 完整 |
| `teaMachine` | `TeaMachineAdapter` | 设备状态 `losses.service.ts:323`（出茶指令接口已定，尚未由业务主动下发） | 接口就绪 |
| `platform` | `PlatformConnector` | 状态展示 `losses.service.ts:330`；外部订单建单已支持 `channel=meituan/taobao` | **拉单调度未实现**，见 §7 |
| `member` | `MemberProvider` | 顾客核销 `customer.controller.ts:95`、营业台核销 `store.controller.ts:127/147` | 完整 |
| `wechat` | `MiniProgramAuthProvider` | 登录 `auth.service.ts:67`、手机号 `:103`、下单支付 `customer.controller.ts:145` | 完整 |
| `avatar` | `AvatarStorageProvider` | 头像上传 `auth.service.ts:189` | 本地落盘可用，生产建议换对象存储 |
| `profileSync` | `ProfileSyncProvider` | 资料保存后推送 `auth.service.ts:219` | 空实现，等第三方用户中心 |

接口的完整字段定义见 `src/contracts.ts`。**不要**在业务层直接引入厂商 SDK；所有厂商细节留在 `providers/live/` 里。

## 4. 接入一个真实渠道（以微信支付为例）

1. 复制 `providers/live/payment.example.ts` 为 `payment.wechat.ts`，按微信支付 JSAPI 文档补全四个方法。
2. 在 `providers/live/index.ts` 注册：

```ts
import { WechatPayGateway } from './payment.wechat';

export const liveProviders: Partial<LiveProviderFactories> = {
  payment: (ctx) => new WechatPayGateway(ctx.config.wechat)
};
```

3. 本地先 `INTEGRATIONS_MODE=live pnpm --filter @teahour/server build` 确认能编译，再启动。
4. 调 `GET /api/health`，`integrations` 字段应显示每项的真实实现名与 `live` 模式。

`LiveContext` 当前只提供 `config`（含 `wechat.appId/appSecret/mchId`、`upload.root`、`upload.assetUrl`、`env`）。需要额外配置就在 `contracts.ts` 的 `IntegrationsConfig` 里加字段，并在 `config.ts` 中读取环境变量。

## 5. 支付回调约定

路由：`POST /api/hooks/payment/:provider`

- `:provider` 必须等于 `payment.name`，否则 404。
- 该渠道没实现 `handleCallback` 时返回 501（现金、纯线下属于这种情况）。
- 验签失败返回 400，**订单状态不变**。
- 业务侧保留原始请求体：`req.rawBody` 是未解析的原始字符串，必须用它验签，不能用重新序列化后的 JSON。
- 适配器只负责"这个通知是真的、对应业务单号是哪个"，落账由 `orders.service.markPaid()` 完成，该方法幂等：已支付订单重复通知不会重复记账、不会重复出杯、不会重复写财务流水。

适配器约定：

```ts
async handleCallback(req: PaymentCallback): Promise<PaymentCallbackResult> {
  // 1. 用 req.rawBody + req.headers 验签
  // 2. 校验金额、商户号与业务单号
  // 3. 返回 { ok: true, reference: 业务 orderId, providerRef: 渠道单号 }
  // 对账通知（退款成功、关单等）没有待落账订单时返回 { ok: true } 即可，业务不会改单
}
```

**任何签名/金额校验失败都返回 `ok:false` 并给出 `error`，不要抛异常。**

## 6. 硬性要求（上线前逐条自查）

- `charge`：金额以服务端 `amountCents` 为准，禁止把客户端传入的金额直接透传；校验商户号与订单号。
- `refund`：累计退款不得超过原支付金额；退款失败返回 `ok:false`。
- `handleCallback`：必须验签 + 幂等（同一通知重复到达只落一次账）。
- `print`：失败返回 `ok:false` 与可读原因，业务会展示"已收款、打印失败"并允许重打，不要吞异常。
- `wechat.code2Session`：`code` 只能换一次 openId，拿到后按 `openId` 复用顾客账号，不要每次建新用户。
- 生产必须 `INTEGRATIONS_MODE=live`，且 8 项全部注册。

## 6.1 汇付天下（斗拱 v2）服务商模式

实现位置：`src/providers/live/huifu.ts`，在 `providers/live/index.ts` 注册为 `huifu-payment`。

| 能力 | 接口 | 说明 |
| --- | --- | --- |
| 小程序支付 | `POST /v2/trade/payment/jspay`（`trade_type=T_MINIAPP`） | 后端预下单后下发 `wx.requestPayment` 参数；`sub_appid` 为小程序 AppID，`openid` 取当前顾客 |
| 顾客扫我们的码 | `jspay`（`T_NATIVE`） | 后台生成二维码，轮询 `/v2/trade/payment/scanpay/query` 确认到账 |
| 我们扫顾客的码 | `POST /v2/trade/payment/micropay` | 付款码只透传，不保存、不写日志 |
| 退款 | `POST /v2/trade/payment/scanpay/refund` | 以 `org_hf_seq_id` 原路退款 |
| 异步通知 | `POST /api/hooks/payment/huifu-payment` | form-urlencoded，使用原始 `rawBody` 做 RSA-SHA256 验签；兼容旧版回调密钥 MD5 |

所有金额以服务端 `amountCents` 换算为元字符串下发；订单只在验签通过的回调或渠道查询确认后落账，前端 `wx.requestPayment` 成功不代表已收款。

### 6.1.1 启用步骤（服务器）

1. 把三个凭证文件放进 `/etc/teahour/huifu/`（目录 750 root:teahour，文件 640 root:teahour）：
   - `merchant_private_key.pem`：商户 RSA 私钥（PKCS#8 PEM）
   - `huifu_public_key.pem`：汇付平台 RSA 公钥（PEM）
   - `webhook.key`：回调密钥（纯文本一行）
2. 在 `/etc/teahour/api.env` 增加：
   ```bash
   INTEGRATIONS_PAYMENT_MODE=live
   HUIFU_SYS_ID=...
   HUIFU_HUIFU_ID=...
   # 多门店各自子商户号时：
   # HUIFU_STORE_MERCHANTS={"sh":"...","sh-west":"...","bj":"...","bj-east":"..."}
   ```
3. `systemctl restart teahour-api`，然后 `curl -s https://teahour.fullyu.cn/api/health`：
   `integrations.payment` 应显示 `{"name":"huifu-payment","mode":"live"}`。
4. 用 1 分钱真实交易分别验证：小程序 JSAPI、后台收款码、后台扫付款码、后台退款。
5. 凭证缺失只会在首次调用时返回明确错误，不会阻止服务启动，也不会静默回落 mock。

## 7. 已知缺口

**平台（美团/淘宝）拉单尚未挂调度。** `PlatformConnector.pullOrders/acknowledge` 接口已定，业务建单也已支持 `channel=meituan|taobao`，但当前没有任何定时任务调用 `pullOrders`。对接团队实现连接器后，需要由后端负责人新增一个调度入口（建议放在 `apps/server/src/orders/` 下，复用 `orders.createOrder({ channel, externalRef, ... })`），这部分属于业务代码，务必先和后端负责人对齐再改。

## 8. 验证

```bash
pnpm --filter @teahour/integrations build     # 编译对接包
pnpm --filter @teahour/server test            # 100 项后端测试，含对接与回调用例
pnpm --filter @teahour/server test -- src/hardware/integrations.spec.ts
pnpm --filter @teahour/server test -- src/api/hooks.spec.ts
```

新增真实实现时，请在 `providers/live/` 旁补一组不依赖外网的测试（验签向量、金额校验、幂等回放），不要把真实凭证写进测试。
