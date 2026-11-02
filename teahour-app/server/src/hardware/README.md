# 硬件与外部系统适配接口

本目录（`server/src/hardware/`）是时叙与真实设备、支付渠道、外卖平台、会员体系之间的唯一接入层。当前所有实现均为 **mock**：业务主流程完整运行，但不会连接或操作任何真实硬件。

```
server/src/hardware/
├── contracts.ts   接口与数据结构（替换实现时只需遵守这里）
├── mocks.ts       当前 mock 实现（可保留用于本地开发与自动化测试）
└── index.ts       注册表：决定运行时使用哪一组实现
```

## 1. 五个接口

| 接口 | 真实系统举例 | 当前 mock 行为 |
| --- | --- | --- |
| `LabelPrinter` | 飞鹅 / 得力云打印、门店 USB 标签机 | 20ms 后返回成功，`providerRef=PRINT-<单号>-<时间戳>`；`failNext()` 可模拟离线 |
| `TeaMachineAdapter` | 三台泡茶机的厂商网关 / 串口协议 | `status()` 返回 3 台在线；`brew()` 只确认收到命令，不启动设备 |
| `PaymentGateway` | 微信支付、支付宝、聚合收银 | `charge()` 返回成功与 `PAY-` 流水号；`refund()` 返回 `REF-` 流水号；`simulateFailure()` 可模拟失败 |
| `PlatformConnector` | 美团、淘宝闪购订单同步 | `pullOrders()` 永远返回空数组；`acknowledge()` 返回 true |
| `MemberProvider` | 时叙会员中台 / 小程序会员码 | 校验 `TH-` 开头、长度 ≥ 4 的码，返回年会员、每杯减 ¥1 |

完整字段见 `contracts.ts`。金额一律为 **整数分**，时间戳为毫秒。

### 打印任务载荷

`print()` 接收一次订单的全套杯贴：

```ts
{
  orderId, orderNumber, storeId, reprint,
  labels: [{ label, orderNumber, storeName, productName, temp, ice, cupIndex, cupTotal, printedAt }]
}
```

`label` 是杯贴上的全局扫码编号（如 `A004`），营业台扫码出餐依赖它，真实打印驱动必须原样印出，不可自行截断或改格式。

## 2. 运行时替换方式

`server/src/hardware/index.ts` 是唯一的装配点：

```ts
export const hardware = {
  printer: new MockLabelPrinter(),
  teaMachine: new MockTeaMachine(),
  payment: new MockPaymentGateway(),
  platform: new MockPlatformConnector(),
  member: new MockMemberProvider()
};
```

接入真实系统时，新建实现类并在此处替换即可，业务代码无需改动。推荐按环境变量选择，保证本地与测试永远走 mock：

```ts
const live = process.env.HARDWARE_MODE === 'live';

export const hardware = {
  printer: live ? new FeiePrinter({ sn: process.env.FEIE_SN! }) : new MockLabelPrinter(),
  teaMachine: live ? new StoreGatewayMachine({ baseUrl: process.env.BREW_GATEWAY! }) : new MockTeaMachine(),
  payment: live ? new WechatPayGateway({ /* 从密钥管理读取，不写入仓库 */ }) : new MockPaymentGateway(),
  platform: live ? new MeituanConnector({ /* ... */ }) : new MockPlatformConnector(),
  member: live ? new MemberCenterProvider({ /* ... */ }) : new MockMemberProvider()
};
```

同一接口允许按门店混合使用（例如直营店接云打印、快闪店仍用 mock），但必须在门店设备页展示真实状态，不能让界面把 mock 显示成“已连接”。

## 3. 业务侧调用点

| 调用点 | 文件 | 说明 |
| --- | --- | --- |
| 下单后入打印队列 | `services/printing.ts` → `enqueuePrintJob()` | 写入 `print_jobs`，订单 `print_status='queued'` |
| 执行打印 | `services/printing.ts` → `processPrintJob()` | 先检查门店 `printer_status`，再调用 `hardware.printer.print()`；失败保留队列并记录 `last_error` |
| 支付 | `services/orders.ts` → `createOrder()` | 未支付订单落库后调用 `hardware.payment.charge()`；失败标记支付失败并抛错；成功写 `payment_ref` |
| 退款 | `services/orders.ts` → `executeRefund()` | **必须**先走退款审批/权限校验，审批通过后才调用 `hardware.payment.refund()`；网关成功后才改订单与库存 |
| 设备状态 | `services/losses.ts` → 设备健康 | 并行汇总 `printer.status()`、`teaMachine.status()`、`payment.status()`，外加 platform/member 的 `mode` |
| 会员校验 | `routes/customer.ts` | 顾客会话与下单时调用 `hardware.member.verify(code)`，折扣按杯计算 |
| 平台订单 | 暂未接入调度 | `PlatformConnector` 已定义，但没有轮询任务；接入时新增定时任务拉单 → 创建 `external` 订单 → `acknowledge()` |
| 泡茶机冲泡 | 暂未接入主流程 | `TeaMachineAdapter.brew()` 已定义；是否自动下发属于门店 SOP 决策，接入前不要擅自串进下单链路 |

## 4. 接入真实硬件时必须补的工程项

1. **幂等**：支付以 `orderId`、退款以 `refundRef` 作为渠道幂等键；网络超时后先查询渠道状态，不能直接重扣或重退。
2. **签名与回调**：支付/平台回调必须验签、校验金额与订单号，回调处理与本地事务分离，失败可重放。
3. **超时与重试**：所有适配器调用设置超时；打印失败保留 `queued` 并由营业台“补打”重试，不做无限自动重试。
4. **密钥管理**：商户号、API 密钥、打印机 SN、设备 token 只从环境变量或密钥管理读取；不写进代码、日志、截图或记忆文件。
5. **门店绑定**：打印机与泡茶机必须绑定到具体门店（`stores.printer_status` 目前是演示字段，真实接入建议新增设备表），跨店取号不得串打。
6. **权限**：退款仍受 `满 ¥50 需总部审批` 与 `approval:view` 约束；设备配置受 `store:device` / `store:config:edit` 约束，接入层不得绕过。
7. **可观测**：记录每次调用的入参摘要、渠道流水号、耗时与错误码；日志中禁止出现会员码、手机号、支付凭据全文。
8. **降级**：支付不可用应阻止下单；打印不可用应允许下单但明确提示“标签打印未完成”，营业台可补打；设备状态不可用应显示离线而不是假装在线。
9. **合规**：真实支付需要商户资质与收单配置；真实会员与订单数据不得进入演示库，也不得导出到外部链接。

## 5. 本地验证

```bash
npm test                      # 包含支付、打印、退款、会员折扣的集成测试（全部 mock）
curl http://localhost:8787/api/health
# {"ok":true,"hardware":"mock","note":"支付、打印、泡茶机、平台与会员均为预留适配接口，未连接真实设备"}
```

营业台「设备」页读取 `/api/store/devices`，所有卡片会明确标注“模拟”，用于验收交互，不代表真实产线状态。
