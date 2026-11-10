# 时叙 × 在场：文案正式化、个人资料对齐、后台合并

日期：2026-10-30
状态：已确认，进入实施

## 背景

三件事一起做：

1. 时叙小程序存在大量"演示 / 模拟 / 示例 / 草案"字样，要按正式系统的口径重写。
2. 时叙个人资料不可维护，需要能编辑头像、姓名、生日、性别，并与 Full愈 其他系统（在场）保持一致。
3. 时叙后台的平板营业台与管理后台是两个外壳，要合并成一套，由角色区分可见范围。

## 已确认的决策

| 决策点 | 结论 |
|---|---|
| 资料打通层级 | 先让在场与时叙的字段/能力一致；在场补性别、生日、会员码二维码；时叙参考在场做。后续由第三方用户中心做真正的跨系统同步 |
| 在场改动范围 | 本次连在场前后端源码一起改，**不部署**；改前已做 tar.gz 快照备份 |
| 文案口径 | 彻底干净，一个环境字样也不留（用户可见文案） |
| Java 验证 | 接受静态改动，逐行对照现有写法；明确记录"未经编译与运行验证" |

## 验证边界（必须如实交付）

- 时叙三端：后端 Jest、小程序与 admin 编译、浏览器截图核验，全部真实执行。
- 在场两侧：**无法验证**。本机没有 JDK、没有 Maven（`~/.m2/repository` 为空），没有 MySQL/Redis；`full-yu-mini2` 的 `node_modules` 为 0 项且是 HBuilderX 工程。因此在场的改动只做到源码改完 + SQL 脚本就位 + 逐行对照现有写法。

## 调研得到的在场事实（设计依据）

- 顾客模块在 **`mall-admin`**，不在 `mall-portal`。表 `c_customer`。
- 现有列：`id, nickname, avatar, invitation_code, invitation_qr_image, referrer_customer_id, phone, integration, open_id, gender, comment, note, update_time, create_time`。**没有 birthday**。
- 实体 `mall-admin/src/main/java/com/macro/mall/entity/Customer.java` 是手写 MyBatis-Plus（不是 MBG 生成），加列只需加属性，不跑 generator。
- `gender` 是 `Integer`，1=男 / 2=女，约定只隐含在 `CustomerService.java:661` 与 `OrderService.java:3011`。
- 登录态：`ContextMixin.curCustomerId()` 取 header `Authorization` → `SessionService` 查 Redis。
- `avatar` 存 OSS key，靠 `@JsonSerialize(QiniuUrlSerializer)` 输出带签名的完整 URL；写入时传 key。
- `CustomerController.java:60` 有一个 `PUT /customer` 收 `@RequestBody Customer` 全字段更新且**不走 `curCustomerId()`**，属越权口子。本次不动它，只在交付说明中标注风险。
- `update/avatar` 与 `update/nickname` 现有实现**完全没有参数校验**。

## 一、小程序文案正式化

就地替换，不动页面结构与 class。**用户可见文案**不留任何环境字样；**代码注释保留技术真相**（注释仍写明当前是 mock 适配层），否则代码会误导后续接手的人。

`apps/miniprogram/src/pages/index/index.vue`：

| 行 | 原文 | 改为 |
|---|---|---|
| 41 / 116 | 多城多店 · 地点均为示例 | 多城多店 · 就近选择 |
| 64 | 概念视觉 | 删除该脚注元素 |
| 209 | 香气为研发灵感，不代表加入精油；名称、价格与配方均为草案 | 香气为风味描述，不含精油添加 |
| 284 | …各自购物袋都会保留。价格与包装规格为演示草案。 | 删后半句 |
| 396 | 已应用大会员演示权益 | 已应用会员权益 |
| 422 | 模拟微信支付 | 微信支付 |
| 483 | 净支付 · 模拟 | 净支付 |
| 520 | 模拟支付后，订单会出现在这里 | 支付完成后，订单会出现在这里 |
| 556 | 本地演示账户 · 无需手机号 | 真实信息：会员码；未绑定手机号时提示绑定（见第二节） |
| 572 | 全品牌共享身份与积分 · 接口模拟 | 全品牌共享身份与积分 |
| 624 / 800 | 隐私与演示说明 | 隐私说明 |
| 630 | 不做储值；账户、积分与会员为本地模拟，未读取在场的真实个人资料 | 不做储值。账户与积分只用于会员权益核算；资料仅在你本人授权后更新 |
| 663 | 跨城多店 · 地点均为示例。鲜酿在… | 删前半句 |
| 686 | …也可以手动选择，模拟扫码结果 | …也可以手动选择门店与桌号 |
| 792 | …请到店联系伙伴；本演示不接入真实客服系统 | 删后半句 |
| 795 | 演示环境：支付、打印、会员核验均为模拟 | 整行删除 |
| 802 | 会员码、提货码为本地生成，仅用于演示扫码流程 | 会员码用于到店核销权益，提货码用于领取零售商品 |
| 1276 | 支付参数为模拟值，本单已按演示支付记账 | 支付完成 |
| 1326 | 手机号已绑定（模拟号码） | 手机号已绑定 |

另：`apps/admin/src/components/AppTop.tsx:85` 去掉"本地演示数据"。

保留 L209 的"不含精油添加"，这是品牌科学表述护栏，不能随"草案"一起删。

## 二、个人资料：字段对齐 + 预留用户中心

"保持一致"的实现范围是**字段、校验、交互机制一致**；视觉各自沿用自己的设计语言（两个品牌视觉不同，且时叙有"不推翻原样式"的约束）。

### 字段契约

| 语义 | 在场 `c_customer` | 时叙 Prisma | 规则 |
|---|---|---|---|
| 头像 | `avatar`（OSS key，现有） | `avatarKey` 新增 | 存 key，读时服务端拼完整 URL |
| 姓名 | `nickname`（现有） | `name`（现有） | 契约名 `nickname`，时叙侧映射 |
| 性别 | `gender` Int（现有） | `gender Int?` 新增 | 只接受 1=男 / 2=女 / null |
| 生日 | `birthday DATE NULL` 新增 | `birthday DateTime?` 新增 | `yyyy-MM-dd` |
| 会员码 | `member_code varchar(32)` 新增 | `memberCode`（现有） | 见下方「会员码格式」 |

#### 会员码格式（实现与初稿不同，以此为准）

初稿写的是「统一格式 `FY` + 10 位数字」。实际落地时时叙已有并保留 `TH-YYMM-NNNN`（如 `TH-261030-4739`），原因有两点：

1. 时叙营业台的会员码校验、扫码识别与种子数据都已按 `TH-` 前缀实现，改格式要连带改营业台扫码、后端校验与已有数据。
2. 两个系统的会员码本来就不是同一个号段。真正的跨系统统一应该由后续第三方用户中心统一发号，而不是现在两边各自猜一套相同规则。

因此本次采用**按系统前缀 + 同一结构**：时叙 `TH-YYMM-NNNN`，在场 `ZC-YYMM-NNNN`。结构一致，便于用户中心上线后做一次性归一。

同一人判定键 = **手机号**。两个小程序 appid 不同，openId 天然不同，跨 appid 识别同一人只能靠手机号或同一开放平台主体下的 UnionID。UnionID 作为后续升级项预留，本次不实现。

### 校验（两边同一套）

- 姓名：去首尾空白后 1–12 个字符，禁换行，不可为空。
- 性别：仅 1 / 2 / null。
- 生日：`yyyy-MM-dd`，范围 1900-01-01 至今天，拒绝未来日期。
- 头像：仅 jpg / png，≤ 2MB。

在场现有 `update/avatar`、`update/nickname` 没有校验，本次把同一套校验补回去。

### 接口

在场（`mall-admin`）：

- 新增 `PUT /customer/update/profile`，body `{nickname?, gender?, birthday?}`，走 `ContextMixin.curCustomerId()`。
- 现有 `update/avatar`、`update/nickname` 保持路径与签名不变（向后兼容），只补校验。
- **不复制** `CustomerController.java:60` 的全字段无鉴权写法。

时叙（`apps/server`）：

- 新增 `PUT /api/customer/profile`，body `{name?, gender?, birthday?}`。
- 新增 `POST /api/customer/avatar`，落本地 `uploads/avatars/`，返回 key。
- 头像存储抽成 `AvatarStorageProvider`，与现有 `hardware/` 的 mock 同模式，将来换 OSS 只换实现。
- 新增 `ProfileSyncProvider`：`pushProfile(customer)` / `pullProfile(phone)`。默认空实现，只写审计日志。第三方用户中心到位后替换实现，页面与业务代码不动。

### 会员码二维码

在场已有的 `/customer/invitationQrImage` 是邀请海报（服务端合成 + 微信小程序码接口 + OSS），语义与依赖都不合适。会员码走**前端本地渲染**：

- 内联一份无依赖的 QR 编码器到在场 `utils/qrcode.js`（在场 `node_modules` 为 0 项，不能新增 npm 依赖）。
- 渲染方式与时叙一致：生成 SVG data URL 作 `background-image`。
- 在场个人页新增会员码弹层。

### 交互机制（时叙对齐在场）

- 头像：微信原生 `open-type="chooseAvatar"`。
- 姓名：`<input type="nickname">`。
- 生日：`<picker mode="date">`。
- 性别：两选项单选。

## 三、后台合并

一个 shell 取代 `StoreApp.tsx` / `AdminApp.tsx`，侧栏两组一级菜单：

- **门店营业**（7）：营业台、帮客人点单、零售提取、订单记录、本店在售、报损登记、本店设备
- **经营管理**（12）：经营概览、财务流水、门店利润、运营费用、审批中心、报损与损耗、商品目录、原料映射、门店配置、账号管理、角色权限、操作记录

「操作记录」原本两边各一份，合并为一项放在经营管理——后端本来就按 `storeIds` 过滤，门店角色看到的自然是本店范围。20 项收为 19 项。

- 每项沿用现有 `perm` 门禁。
- **某组全部无权限则整组隐藏**，不显示灰项。店员只见门店营业，总部财务只见经营管理，店长两组都见。
- 默认落地页：有 `pos:use` → 营业台；否则第一个可见项。
- 移除顶部 `平板营业台 / 管理后台` 切换器，保留门店选择器与账号信息。
- 路由保持 `/store/*` 与 `/admin/*` 不变，现有书签与 QA 脚本不受影响。

## 不做的事

- 不接真实支付、打印、会员、外卖接口。
- 不部署任何一端，不执行线上 SQL。
- 不实现跨系统实时同步（等第三方用户中心）。
- 不实现 UnionID 识别。
- 不动在场 `PUT /customer` 越权端点，只记录风险。
- 不重做任何一端的视觉语言。
