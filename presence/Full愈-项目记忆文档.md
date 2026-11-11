# Full愈 项目记忆文档

> 本文档导出 Full愈 项目的关键记忆，供其他 AI 工具或团队成员快速了解项目全貌。
> 生成日期：2025-06-24

---

## 一、品牌介绍

- **英文名**: FullYu / Full 愈
- **中文名**: Full 愈（"愈"意为"治愈"）
- **Logo Mark**: "Ũ"（带波浪号的U）
- **品牌核心理念**: 治愈、平衡、内心健康
- **三个核心价值**: NATURAL（自然）· HEALING（治愈）· INTELLIGENT（智能）
- **设计风格**: 温暖、自然、宁静；大地色系（棕色、米色、柔和色调）；简约、专业、高度结构化
- **完整设计系统名称**: "FULLYU HEALING DESIGN SYSTEM"

---

## 二、项目概述

Full愈系统是面向教育培训行业的 SaaS 平台，包含：

- **微信小程序**：用户端 + 培训师端（4个Tab：首页/课程/会员/我的）
- **PC管理后台**：教务/销售/系统管理三大模块

核心业务能力：
- 课程预约闭环（席位锁定/价格计算/微信支付）
- 会员卡体系（权益/冻结/到期提醒）
- 积分与代金券资产中心
- RBAC 权限管理
- 场地日历看板
- 导师信用体系

---

## 三、技术架构

### 3.1 Monorepo 结构（pnpm workspaces）

```
Full愈/
├── apps/miniprogram/          # uni-app Vue3 微信小程序 (@fullyu/miniprogram)
├── apps/admin/                # Vue3 + Vite + Ant Design Vue 4 PC后台 (@fullyu/admin)
├── apps/server/               # NestJS + Prisma + PostgreSQL 后端API (@fullyu/server)
├── packages/design-tokens/    # 品牌设计Token (@fullyu/design-tokens)
└── packages/shared/           # 共享类型和常量 (@fullyu/shared)
```

### 3.2 技术栈

| 端 | 技术栈 |
|----|--------|
| 小程序 | uni-app + Vue 3 + TypeScript + Pinia |
| PC后台 | Vue 3 + Vite + Ant Design Vue 4 + Pinia |
| 后端 | NestJS + TypeScript + Prisma ORM |
| 数据库 | PostgreSQL + Redis |
| 文件存储 | 腾讯云COS/阿里云OSS |
| 支付 | 微信支付 V3 API |
| 消息推送 | 微信公众平台模板消息 |

### 3.3 运行命令

```bash
# 确保 node 可用
export PATH="/Users/th/.local/node/bin:$PATH"

pnpm dev:admin     # 启动PC后台 (localhost:5173)
pnpm dev:server    # 启动NestJS服务 (localhost:3000)
pnpm dev:mp        # 编译小程序
pnpm run build:admin  # 构建PC后台
pnpm run build:h5     # 构建小程序H5版
```

### 3.4 后端模块

auth, user, course, order, trainer, member, voucher, task, admin, venue, material, settlement, analytics

### 3.5 数据库

Prisma Schema: `apps/server/prisma/schema.prisma`（25+ models）

---

## 四、设计系统规范

### 4.1 色彩系统

#### 主色 (Primary Colors)

| 名称 | Hex | 用途 |
|------|-----|------|
| Deep Brown | `#6B463C` | 主品牌色 — 按钮、强调、图标、高亮 |
| Dark Brown | `#4B3621` | 强强调 — 标题、浅底上的文字 |
| Taupe | `#A08A72` | 次要强调 — 边框、图标、微妙背景 |

#### 背景色

| 名称 | Hex | 用途 |
|------|-----|------|
| Warm Cream | `#F5E8D8` | 主页面背景、区域、表面 |
| Light Peach | `#FFF3E0` | 交替背景、微妙高亮 |

#### 浅底文字色阶

| 层级 | Hex | 对比度 | WCAG等级 |
|------|-----|--------|----------|
| Primary Text | `#4B3621` | 12.63:1 | AAA |
| Secondary Text | `#6B463C` | 6.33:1 | AA |
| Tertiary/Muted | `#A08A72` | 4.21:1 | AA |
| Disabled Text | `#C6B8A6` | 3.02:1 | AA Large |

#### 深底文字色阶

| 层级 | Hex | 对比度 | WCAG等级 |
|------|-----|--------|----------|
| Primary Text | `#F5E8D8` | 13.68:1 | AAA |
| Secondary Text | `#EEE0C6` | 11.17:1 | AAA |
| Tertiary Text | `#D8C6A8` | 4.57:1 | AA |
| Muted Text | `#B8A88C` | 3.11:1 | AA Large |

#### 按钮配色

- Primary Button: `#6B463C`
- Hover State: 更深的 Deep Brown
- Secondary Button: `#A08A72`
- Outline Button: 白色边框 + Taupe 填充
- Disabled Button: 柔和 Taupe

#### 无障碍要求

- 所有组合满足 WCAG 2.1 AA 标准（普通文字 4.5:1，增强可读性 7:1）
- 在图片或其他颜色上叠加文字时，确保足够对比度，必要时使用遮罩层

### 4.2 字体排版规范

#### 字重

| 字重 | 用途 |
|------|------|
| Regular (400) | 正文内容 |
| Medium (500) | 标签、强调 |
| Bold (700) | 标题、重点强调 |

#### 字号体系

| 角色 | 尺寸 | 行高 | 字间距 | 用途 |
|------|------|------|--------|------|
| H1 | 48px / 3rem | 1.2 | -1% | 页面标题 |
| H2 | 32px / 2rem | 1.25 | -0.5% | 章节标题 |
| H3 | 24px / 1.5rem | 1.3 | 0% | 子标题 |
| Body | 16px / 1rem | 1.7 | 0% | 正文 |
| Caption | 14px / 0.875rem | 1.6 | 0% | 说明文字、标签 |
| Small | 12px / 0.75rem | 1.5 | 0% | 脚注、小字 |

#### 字体颜色使用

| 背景 | 文字色 | 说明 |
|------|--------|------|
| 浅色(白) | `#1A1A1A` | 标准深色文字 |
| 奶油色 | `#2B1E12` | 暖底深色文字 |
| 棕色 | `#FFFFFF` | 反白文字 |
| 深色(黑) | `#F2EDE3` | 浅色反白文字 |

#### 代码字体

- Font Family: SF Mono, Consolas, Menlo, monospace
- Size: 14px / 0.875rem
- Line Height: 1.6

### 4.3 组件设计规范

#### 圆角规范

| 圆角 | 用途 |
|------|------|
| 8px | 小圆角 — 微妙元素 |
| 12px | 中圆角 — 卡片和输入框 |
| 16px | 大圆角 — 显著元素 |

#### 间距体系

| 值 | 标签 | 说明 |
|----|------|------|
| 4px | Extra Small | 最小间距 |
| 8px | Small | 小间距 |
| 12px | Base | 基础间距 |
| 16px | Medium | 中等间距 |
| 20px | Large | 大间距 |
| 24px | Extra Large | 超大间距 |
| 32px | Extra Extra Large | 最大间距 |

#### 卡片组件

- Content Card: 标题 + 描述 + "Learn more →" 链接
- Image Card: 图片 + 标题 + 描述 + "View details →" 链接
- Stats Card: 大数字 + 标签 + 增长指标
- 卡片状态: Default（柔和阴影）→ Hover（微微上浮）→ Bordered（细边框）→ Elevated（强投影）
- 卡片内部 padding: 16px

#### 按钮组件

**Primary Button（填充按钮）**

| 状态 | 背景 | 文字 |
|------|------|------|
| Default | `#6B463C` | 白色 |
| Hover | `#5A3A32` | 白色 |
| Active | `#4A2F28` | 白色 |
| Disabled | `#B8A49A` | `#FFFFFF` |
| Loading | `#6B463C` + Spinner | 白色 |

- 尺寸: H: 40px | Padding: 0 16px | Radius: 8px

**Secondary Button（描边按钮）**

| 状态 | 边框 | 文字 |
|------|------|------|
| Default | `#5A3A32` | `#5A3A32` |
| Active | `#4A2F28` | `#4A2F28` |
| Disabled | `#D8CBBB` | `#B8A49A` |

#### 输入框组件

- 尺寸: H: 40px | Padding: 0 12px | Radius: 8px
- 默认边框: `1px solid #D8CBBB`
- Focus: `3px Shadow #6B463C26`
- Error: 红色边框 `#C0392B` + 红色警告三角图标

#### 阴影

- Soft Shadow: `0px 2px 4px rgba(107, 70, 60, 0.08)`
- Focus Shadow: `0px 0px 3px rgba(107, 70, 60, 0.15)`

---

## 五、核心功能需求与业务规则

### 5.1 小程序课程模块

- **课程列表**: 横向紧凑卡片布局，图片置于左侧，单页显示更多课程
- **封面图**: 必须完整展示用户上传的封面图（`<image>` 组件 + `aspectFill` 模式），禁止文字覆盖，点击触发 `uni.previewImage` 显示大图
- **课程详情**: 仅显示用户本次应付价格（根据报名人数自动匹配阶梯），移除阶梯价格表格
- **图片滚动展示**: 详情页支持图片横向滚动展示（来源于后台课程发布时上传的多张详情图）
- **签到**: 教务后台操作，用户端仅显示签到结果（待签到/已签到/缺勤），移除用户端签到按钮

### 5.2 后台课程发布

- 支持复制课程生成草稿
- 封面图强制正方形裁剪（1:1）
- **详情图集**: 支持上传 3-8 张详情图，用于小程序详情页滚动展示
- **导师图片推荐**: 选择导师后自动推荐该导师已有课程的图片，优先匹配课程名称相似的图片
- 新增候补排队机制（支持截止时间设置、自动替补、100%无责取消）
- 阶梯定价支持自定义人数区间（如第1-2位¥300、第3-5位¥330）
- 会员卡折扣改为百分比制（如70%表示七折）

### 5.3 会员卡管理

- 支持销售录入用户基础信息（称呼、性别、年龄、生日、课程期待、健康禁忌等）
- 小程序端购买时必填称呼/性别/生日
- 支持冻结/解冻/续卡/删除操作
- 所有操作按钮必须实际生效（不能只弹 toast）

### 5.4 订单管理

- **统一订单管理**: 所有收款行为（课程+会员卡）集中在订单管理模块
- **Tab 视图**: 全部订单 / 课程订单 / 会员卡订单
- **会员卡订单字段**: 卡类型、有效期、优惠等专属字段
- **详情页**: 根据订单类型动态渲染字段（课程名 vs 卡类型+有效期）
- **退款**: 会员卡退款增加「退卡」原因选项，提示"退款后卡失效"
- **统计**: 动态计算（随 Tab 筛选联动）

### 5.5 代金券管理

- 创建代金券需实际添加到列表
- 发放需更新已发数量和记录
- 支持删除操作

### 5.6 其他功能

- **场地预约**: 按天、按小时维度展示具体预约人及用途，提供忙闲时段分析；场地概览支持 hover 显示连续占用时间段
- **签到管理**: 支持按课程和按学员双视角，精确到具体人员的签到状态
- **导师管理**: 支持头像上传；导师标签统一由系统值集管理；增加导师等级筛选项
- **课程评价**: 后台支持按星级筛选（尤其低星）、点击回访抽屉查看用户详情及历史记录
- **场地管理**: 每个教室可单独配置营业开始/结束时间
- **值集管理**: 全局值集配置模块，所有下拉选项（导师标签、课程类型、会员卡类型、性别等）均从此处统一维护
- **RBAC**: 后台路由守卫 `/dashboard`, `/education/*`, `/sales/*`, `/system/*`

---

## 六、开发规范

### 6.1 后台数据可编辑性规范

所有后台管理页面的数据项必须支持完整的可编辑链路，包括已发布的实体（如导师、课程）的字段编辑，以及状态变更（如导师在职状态切换）。

### 6.2 代码风格（Prettier）

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

### 6.3 运行环境要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- 运行时 PATH: `/Users/th/.local/node/bin`

---

## 七、文件结构速查

```
apps/admin/
├── src/
│   ├── views/
│   │   ├── education/         # 教务管理
│   │   │   ├── course/        # 课程管理
│   │   │   ├── trainer/       # 导师管理
│   │   │   └── venue/         # 场地管理
│   │   ├── sales/             # 销售管理
│   │   │   ├── user/          # 用户管理
│   │   │   ├── membercard/    # 会员卡管理
│   │   │   ├── voucher/       # 代金券管理
│   │   │   └── order/         # 订单管理
│   │   └── system/            # 系统管理
│   │       ├── settlement/    # 结算管理
│   │       ├── analytics/     # 数据分析
│   │       ├── rbac/          # 权限管理
│   │       └── dict/          # 值集管理
│   ├── stores/                # Pinia 状态管理
│   └── layouts/               # 布局组件

apps/miniprogram/
├── src/
│   ├── pages/
│   │   ├── index/             # 首页（课程列表）
│   │   ├── course-detail/     # 课程详情
│   │   ├── my-courses/        # 我的课程
│   │   └── ...
│   └── utils/
│       └── request.ts         # Mock 数据层
```

---

*本文档由项目记忆系统导出，版本 1.0 | 2025-06-24*

## 部署（CI/CD）

- 仓库：`git@github.com:531930508-hub/Fullyu.git`（单仓库，在场代码在 `presence/`）
- 流水线：`.github/workflows/ci-deploy.yml`。push 到 `main` 且改动命中 `presence/**` 或该 workflow 文件时触发；也可用 `workflow_dispatch` 手动运行
- 自动部署开关：仓库变量 `ENABLE_DEPLOY=true`（Settings → Secrets and variables → Actions → Variables）。关闭后只构建不部署
- 目标机路径映射：后端源码 `SERVER_PATH=/root/fullyu`；后台静态 `/opt/fullyu/apps/admin/dist`（:8080）；H5 静态 `/opt/fullyu/apps/miniprogram/dist/build/h5`（:8101）
- 部署动作：静态产物整目录替换（旧产物先打 tar 备份到 /tmp）→ 覆盖 `apps/server/src|prisma`、`packages/shared/src` → shared 构建 → prisma generate → tsc → pm2 重启 → health 检查
- 不跑 `pnpm install`（ECS 拉公网依赖不稳），新增依赖需先在 ECS 手工安装
- `prisma db push` 遇测试库历史漂移（遗留表 `payment_attempts`/`refund_attempts`/`member_points_operations`/`member_card_sync`/`member_user_sync`、列 `orders.points_source`）时只告警不阻断；是否 DROP 需人工确认
