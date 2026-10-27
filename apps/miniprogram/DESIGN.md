---
name: Full愈 约课小程序设计系统
version: v1
updated: 2026-10-22
source: 桌面《01-设计-Full愈小程序UI规范与组件库-20261020-v1》（与《Full愈 品牌 VI 手册 v1》对齐）
scope: apps/miniprogram（PC 后台 apps/admin 不适用，另行维护）
supersedes:
  - App.vue「Fūll愈·轻疗 设计系统（2026-09 版）」橄榄棕 #584219 体系
  - packages/design-tokens v1.0 中面向小程序的 Deep Brown #6B463C / Warm Cream #F5E8D8 取值
status: v2 布局已迁移至 15 个真实 Vue 页面；H5 测试环境已发布并完成外网逐页检查，微信正式发布与实机交易验收待人工完成
colors:
  bg-page: "#f5f6ed"
  bg-card: "#ffffff"
  bg-selected: "#f3efe0"
  bg-muted: "#e9e4d2"
  primary: "#683611"
  on-primary: "#f5f6ed"
  text-title: "#3a2a1a"
  text-emphasis: "#96581c"
  text-body-2: "#756a55"   # 补充令牌，见「对比度约束」
  text-secondary: "#9a8f7a"
  cream: "#f6e8b8"
  accent-gold: "#eec76f"
  accent-caramel: "#d2973e"
  brand-senseguide: "#B02A5C"
  func-success: "#8fa35a"
  func-error: "#a03d2a"
  line: "#e6dcc4"
  disabled-bg: "#e9e4d4"
  disabled-text: "#b3a98f"
  chip-off-bg: "#f4f2e9"
  chip-off-text: "#c4bda8"
typography:
  display: { family: "Noto Serif SC / Songti SC", weight: 700, size: "22–28px" }
  title: { family: "PingFang SC", weight: 600, size: "15–17px" }
  body: { family: "PingFang SC", weight: 400, size: "14px", lineHeight: 1.7 }
  caption-en: { size: "10.5–12px", letterSpacing: "0.03em" }
radius: { card: 16px, button: 12px, button-sm: 9px, chip: 10px, tabbar: 18px, sheet: 20px }
spacing: { base: 4px, scale: [8, 12, 16, 24], page-x: 16px, card-padding: 18px }
shadow:
  card: "0 2px 10px rgba(104,54,17,.05)"
  tabbar: "0 2px 12px rgba(104,54,17,.07)"
  float: "0 4px 14px rgba(104,54,17,.18)"
---

# Full愈 约课小程序设计系统 v1

本文件是小程序视觉与组件的唯一规范来源。色值、组件尺寸以桌面 v1 规范为准；本文件在其基础上补充了**约课业务映射**、**对比度约束**与**代码落地映射**三部分。小程序尺寸写作 px，实现时按 `1px = 2rpx` 换算。

**产品范围（2026-10-21 确认）**：本约课小程序只服务 **在场 FullYu Presence**（导师带领的单次体验与系列课程）。轻疗、时叙为独立小程序，不在本小程序内做业态切换；会员卡、积分、代金券本期只在在场内使用。重设计原型见桌面《Full愈在场约课小程序_重设计原型_20261021_v2》。

## 1. 设计语言

| 特征 | 规则 |
|---|---|
| 氛围 | 米白暖底 `#f5f6ed` + 纯白大圆角卡片（16px）+ 极轻暖调投影；页面大面积底色禁止用纯白 |
| 字体 | 标题思源宋体 Bold；功能/正文苹方；英文标注为小号无衬线，字距 +3% |
| 主行动色 | 深咖 `#683611`，每屏最多一个主按钮 |
| 选择器 | 白底描边，选中为深咖描边 + `#f3efe0` 底 + 右上角 ✓ 角标 |
| 双语 | 固定语法「中文功能词 (English)」，英文 10.5–12px，`#9a8f7a` |
| 文案 | 延续「愈」字造词：预约即「愈」、购卡享「愈」；短句、直接 |
| 图标 | 1.5px 线性 SVG，圆角端点，`stroke=currentColor`；禁用面性彩色图标和 emoji |

## 2. 色彩令牌

| 令牌 | 色值 | 用途 |
|---|---|---|
| bg/page | `#f5f6ed` | 页面底色 |
| bg/card | `#ffffff` | 卡片、输入区、TabBar |
| bg/selected | `#f3efe0` | 选择器选中底 |
| bg/muted | `#e9e4d2` | 未选中服务 Tab、次级块 |
| primary | `#683611` | 主按钮、选中态、问候条、会员卡底 |
| text/title | `#3a2a1a` | 标题与正文 |
| text/emphasis | `#96581c` | 强调文字、链接、线性图标 |
| text/body-2 | `#756a55` | **补充**：中文次要信息（时间、场地、说明）、未选中 TabBar 文字、输入占位、字数计数、步骤条未到达项 |
| text/secondary | `#9a8f7a` | 仅英文标注与装饰（对比度 2.93:1，不得承载中文信息） |
| cream | `#f6e8b8` | 深底上的文字、头像底 |
| accent/gold | `#eec76f` | 会员、积分、金麦点缀 |
| accent/caramel | `#d2973e` | 提醒态、进度条、早鸟/候补点缀（不作文字色） |
| brand/senseguide | `#B02A5C` | 仅精油商城专区 |
| func/success | `#8fa35a` | 成功/完成；SEEDIFY 成长体系 |
| func/error | `#a03d2a` | 错误/警示 |
| line/border | `#e6dcc4` | 描边与分隔线 |

### 对比度约束（WCAG 2.1，实测）

| 前景 / 背景 | 对比度 | 结论 |
|---|---|---|
| `#3a2a1a` / `#f5f6ed` | 12.64 | 正文 AAA |
| `#683611` / `#f5f6ed`（双向） | 9.08 | 主按钮 AAA |
| `#96581c` / `#ffffff` | 5.66 | 强调与链接 AA |
| `#eec76f` / `#683611` | 6.14 | 问候条金数字 AA |
| `#756a55` / `#f5f6ed` | 4.88 | 补充令牌，次要中文 AA |
| `#9a8f7a` / `#f5f6ed` | 2.93 | **不达标**：只用于英文标注、装饰、占位，禁止承载必要信息 |
| `#d2973e`、`#8fa35a` / `#ffffff` | 2.55 / 2.78 | **不能作文字色**，只作色块、进度、描边；色块上的文字用 `#3a2a1a` |
| `#c2527e` / `#fbe3ea` | 3.6 | pilltag 仅限 ≥12px 粗体短标签 |

禁用态（`#b3a98f`/`#e9e4d4`、`#c4bda8`/`#f4f2e9`）按 WCAG 豁免，但必须同时给出文字说明（如「已约满」）。

## 3. 字体、圆角、间距、投影

| 令牌 | 值 | 用途 |
|---|---|---|
| font/display | 思源宋体 Bold 22–28px | 页标题、卡名、价格大字 |
| font/title | 苹方 Semibold 15–17px | 卡片标题、模块标题 |
| font/body | 苹方 14px / 1.7 | 正文 |
| font/caption-en | 10.5–12px / +3% | 英文标注 |
| radius/card | 16px | 卡片 |
| radius/button | 12px（sm 9px） | 按钮 |
| radius/chip | 10px | 选择器 |
| radius/tabbar | 18px | 悬浮标签栏 |
| radius/sheet | 20px 顶部 | Bottom Sheet（补充） |
| spacing | 4 的倍数：8/12/16/24 | 页边距 16，卡内边距 18 |
| shadow/card | `0 2px 10px rgba(104,54,17,.05)` | 不用灰黑投影 |

标题字体与功能字体不混排于同一行；页面标题、卡片名用宋体，标签/按钮/说明用苹方。

## 4. 组件

| 组件 | 规格 |
|---|---|
| Button | 圆角 12、15px、`12px 26px`；primary 深咖底米白字；outline 白底 1.5px `#3a2a1a` 描边；gold 金底墨字（积分/会员兑换）；disabled 米灰；sm `7px 16px` 13px 圆角 9 |
| Chip Selector | 白底 1px 线色，圆角 10，`11px 26px`；选中深咖描边 + `#f3efe0` + 600 + ✓ 角标（18px，`0 10px 0 10px`）；约满 `#f4f2e9` / `#c4bda8` |
| Card | 白底、圆角 16、内边距 18；标题 15/600；副标题 12.5 `#756a55`；分隔线 1px 线色 |
| Service Tab | 顶部圆角 14 的分段卡；未选 `#e9e4d2`，选中白底 + 宋体中文 + 英文副标（选中为 `#96581c`） |
| Stepper | 30px 圆形 ± + 52×32 数字框，1.5px 墨色描边；标签「人数 (Number of Guests)」 |
| Greeting Bar | 深咖底、cream 字、金色数字、顶部圆角 16；下接白色入口卡（预约即「愈」/ 购卡享「愈」） |
| Booking Card | 「您的上次预约」+ 课程名；头像为 cream 圆底宋体首字；右侧 outline sm 按钮 |
| Bottom Action Bar | 固定于安全区上方；次按钮在左、主按钮在右 |
| Tab Bar | 白底、圆角 18、`10px 6px`、tabbar 投影；11px；选中深咖 600，未选 `#756a55`（原稿 `#9a8f7a` 在白底仅 3.19:1，已修正） |
| AI Float | 62px 白色圆形 + float 投影，线性机器人图标 + 「AI预约」 |
| Bottom Sheet（补充） | 白底、顶部圆角 20、抓手 36×4 线色；替代核心交易链路的原生弹窗 |
| Status Pill（补充） | 圆角 20、10.5–12px；待上课 `#f3efe0`/`#683611`；已完成 `#eef1e3`/`#5c6b34`；已取消 `#f4f2e9`/`#756a55`；候补 `#fbf1df`/`#8a5a17` |

## 5. 子品牌皮肤

| 专区 | 主色 | 点缀 |
|---|---|---|
| 在场约课小程序（本小程序全部页面） | 深咖 `#683611` | 金麦 `#eec76f` |
| SEEDIFICATION 证书 / 成长体系 | 青绿 `#8fa35a`（只作色块） | 咖啡 `#96581c` |

轻疗、时叙、香复吾言精油、深疗 The One 的皮肤归各自独立小程序，不在本文件内定义。

## 6. 约课业务映射

v1 组件库的示例来自门店按摩预约场景，不照搬门店字段。以下记录 2026-10-22 真实代码的落点；原型中的数字与能力示例不等于已接通的业务。

| 组件 | 当前落点与边界 |
|---|---|
| Banner | 内容顶部展示接口广告；图片完整展示，不覆盖样例营销文案。建议运营提供横版素材；竖版在横向广告框内会留白。 |
| Service Tab / Chip Selector | 首页按接口分类、日期、场地、难度与余位筛选；不设置单次 / 系列筛选，不做业态切换。类型仍在课程卡内标注。 |
| 人数与场次 | 当前每单 1 人；选择课程即选择其排期，系列课整体报名。不展示未接通的多人 Stepper。 |
| Greeting Bar / Booking Card | 游客登录引导，登录后按真实会员与预约数据展示；下一节课仅取未来已支付课程。不虚构本月次数、上次课程或再约记录。 |
| 待支付卡 | 在预约分段栏上方单独高亮，展示服务端到期时间、金额与续付入口；到期禁付并刷新服务端取消结果，不在前端伪造已取消。 |
| Bottom Action Bar / Sheet | 课程询价、候补、会员购买、取消订单、评价与资料操作保留真实接口及失败恢复。H5 弹层管理焦点、Tab、Escape 与背景滚动。 |
| Tab Bar | 4 项：首页 / 预约 / 会员 / 我的；H5 隐藏框架默认底栏，避免双层导航。 |
| AI Float | 当前无真实服务，不放可点击的模拟入口。 |

### 当前业务字段落点

| 能力 | 真实实现与限制 |
|---|---|
| 系列课 | 展示实际节数与 syllabus；课表缺失显示待公布。无可靠进度、结业条件或证书数据时不造数字。 |
| 阶梯价与会员折扣 | 详情展示接口配置的阶梯价、卡种折扣；最终顺位、优惠和应付金额以服务端询价为准，不由视觉稿定义叠加规则。 |
| 会员优先报名 | 依据课程时间、当前会员及接口结果处理；未接通开售订阅提醒，不承诺固定提前小时数。 |
| 双队列候补 | 展示询价返回的队列、位置、余位与预付金额。最终状态以服务端下单、支付与递补结果为准。 |
| 时段会员价 | 报名确认页展示实际询价规则、固定价格或比例及应付金额。 |
| 成团与退款 | 详情展示实际成团人数、截止时间、refundRules；退款金额与执行状态由服务端核算，本次不修改资金规则。 |
| 积分 / 代金券 | 资产页展示真实余额、明细与券。当前报名弹层明确不使用抵扣，不把原型抵扣开关伪装成已支持。 |
| 签到与评价 | 签到未知显示“签到记录待同步”；只有明确已签到且已完成、未评价的课程显示评价入口，不模拟签到码。 |
| 会员卡 | 使用实际上架卡种、价格与权益说明；核验照片不作为公开头像。无接口支持的累计节省、缺席处罚、卡号等不展示。 |
| 导师 | 展示真实介绍、认证、课程与统计；收益标明课程估算，不代表结算或到账。不生成 PHASE 阶段或成长进度。 |
| 社群 | 广场、动态 / 活动 / 成员、加入 / 管理双视角、三步创建与工作台；无接口支持的互动、付费加入、待办和收入不伪造成功。 |
| 证书与成长体系 | SEEDIFICATION / UNITAR 证书等仍是原型方向，不作为本次已落地能力。 |

## 7. 规则与禁忌

- 每屏主按钮不超过 1 个；禁止深蓝、纯黑、荧光色。
- 大面积底只用 `#f5f6ed`。
- `#9a8f7a`、焦糖、青绿不承载必要的中文信息。
- 核心交易链路（报名确认、会员购买、评价）使用品牌化 Bottom Sheet，不用原生弹窗。
- 未登录、空数据、加载失败三种状态必须在视觉与文案上区分。
- 图片缺失使用米色兜底图 + 线性图标，不用纯色块。

## 8. 代码落地映射（2026-10-22 已迁移）

下表旧值仅用于记录迁移，当前实现以右列为准。

| App.vue 变量 | 历史旧值 | v1 令牌 | 当前值 |
|---|---|---|---|
| `--c-primary` | `#584219` | primary | `#683611` |
| `--c-brown` | `#6D5934` | text/emphasis | `#96581c` |
| `--c-deep` / `--c-ink` | `#3F2F10` | text/title | `#3a2a1a` |
| `--c-cream`（页面底） | `#EAE0D7` | bg/page | `#f5f6ed` |
| `--c-card` | `#FBF8F3` | bg/card | `#ffffff` |
| `--c-card-2` | `#F4EEE6` | bg/selected | `#f3efe0` |
| `--c-apricot` | `#D3956E` | accent/caramel | `#d2973e` |
| `--c-gold` | `#C9A35C` | accent/gold | `#eec76f` |
| `--c-muted` | `#A78E70` | text/body-2 | `#756a55` |
| `--c-secondary` | 无独立变量 | text/secondary | `#9a8f7a` |
| `--c-success` | 无独立变量 | 成功文字补充色 | `#5c6b34`（不是浅绿色色块令牌） |
| `--c-rice` | `#F7F2E9` | on-primary | `#f5f6ed` |
| `--line-soft` | `rgba(88,66,25,.14)` | line | `#e6dcc4` |
| `.card` 圆角 | 44rpx | radius/card | 32rpx |
| `.btn*` 圆角 | 999rpx | radius/button | 24rpx |
| `pages.json` 导航/背景色 | `#EAE0D7` | bg/page | `#f5f6ed` |

令牌与公共类位于 `src/App.vue`，导航使用 `FloatingTabBar`，共享组件为 `BottomSheet`、`PageState`、`BrandCover` 和 `PresenceIcon`。15 个页面均已迁移。`packages/design-tokens` 同时服务 PC 后台，本次没有修改该包或后台主题；小程序使用独立 App.vue 令牌。

### 验收证据与发布边界

- `ui-contract.test.cjs`、`presence-behavior.test.cjs`、`detail-ui.test.cjs`、`community-ui.test.cjs`、`account-ui.test.cjs` 共 65 项结构与行为检查通过；`vue-tsc --noEmit`、H5 与 mp-weixin 构建通过。
- `qa/live-browser-results.json`：本地最终 H5 的 15 路由公开 / 游客状态，未发现运行时异常、破图或横向溢出；首页另检查 360px / 430px。
- `qa/state-browser-results.json`：37 张明确标注本地测试数据的状态截图，12 项交互检查通过。接口在浏览器内拦截，写请求统一模拟失败，没有真实下单、扣款或写入账户资料。
- 已按真实渲染复核待支付置顶、过期禁付、取消 / 评价 / 资料提交失败保留内容、弹层焦点 / Tab / Escape、内部触摸滚动、权限与错误状态。原型与实现的数据、浏览器外框和字体环境不同，不作零像素差异或设计方已签收的声明。
- H5 测试环境已发布：`http://120.55.36.3/#/pages/index/index`，编号 `presence-ui-v2-20261022-235015`。`qa/deployment-manifest.json` 记录外网 86 个构建文件 SHA256 全匹配、API / 数据库 / Redis 健康及后台入口未变化；旧 H5 备份保留。后端 4 个 service 源码与编译文件均已在线，无重复覆盖或重启。
- `qa/deployed-presence-ui-v2-20261022-235015/live-browser-results.json`：真实外网 15 个公开 / 游客路由截图与检查，无运行时异常、破图或横向溢出；首页 360px / 430px 均无溢出。线上未执行真实登录、下单、支付或其他写操作。
- 桌面源码补丁包已更新，须合并至现有完整项目，不是独立仓库；微信编译导入包单独交付。微信正式发布、实机授权、照片上传、真实支付回调 / 退款、全站屏幕阅读器与完整英文界面仍需专项验收。公开接口存在历史测试课程；不通过修改生产数据来美化截图。
- 本地预览由 `qa/preview.py` 提供，只读代理不转发身份信息且禁止写请求，因此不是可直接登录付款的完整联调环境。`qa` 测试资料不属于线上页面。
