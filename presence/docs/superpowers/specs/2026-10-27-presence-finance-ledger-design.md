# 在场财务台账与进销存采购规则设计

日期：2026-10-27
状态：已确认，进入实现

## 一、目标

1. 进销存采购：采购单在数据权限内可见权限范围全部门店的单；门店只能向总部采购，单价由总部锁定；只有总部可对外采购并录入实价。
2. 财务看板：在现有「全业务财务看板」之外，新增独立的「在场业务财务看板」。在场看板只基于本系统真实交易（报课、会员卡、候补、社群年费、导师结算）。
3. 财务流水与业务交易流水分离：新建独立财务台账实体，台账不引用订单表外键；所有在场财务报表只读台账，不实时扫业务表。业务表只作为台账生成的输入。
4. 自然月自动关账：次月 1 日自动冻结上月台账，历史报表数字不再变化；退款、调整产生的负数流水只落在当前未关账月份。

## 二、进销存

### 2.1 采购可见范围

沿用组织行级权限（`buildOrgScope`）：

- 总部（`ALL`）：全部门店采购单。
- 分公司（`OWN_AND_SUB`）：本分公司及下属门店。
- 门店（`OWN_AND_SUB` / `OWN`）：本店。

本次补齐：

- 采购单出参增加 `buyerName`、`buyerType`，详情/列表/待收货不再依赖前端反查组织名。
- 采购方筛选下拉改为权限内全部组织，不再只列 `canPurchase=true`，历史单可筛。
- 明细出参增加 `amount = price × qty`。
- 回归列表、详情、待收货、入库记录的越权校验。

### 2.2 采购规则（服务端强校验）

- `Organization.type ∈ {STORE, SUBSIDIARY}`：`supplierType` 必须为 `HQ`，传 `EXTERNAL` 直接拒绝。
- 只有 `GROUP` / `DEPT`（总部节点）可以创建 `EXTERNAL` 采购单。
- 门店向总部采购：
  - 单价一律取商品档案 `supplyPrice`，忽略前端传入的 `price`，即使持有 `scm:po:price` 也不可改。
  - 只允许修改数量。
- 总部对外采购：
  - 持有 `scm:po:price` 可按实价录入单价；无权限回落到档案 `purchasePrice`。
- 价格可见性：
  - `HQ` 供货单：采购方可见供货价与应付金额（这是门店要付给总部的钱），不受 `scm:po:price` 限制。
  - `EXTERNAL` 采购单：仍按 `scm:po:price` 裁剪单价与金额。
  - 商品接口：无 `scm:po:price` 时隐藏 `purchasePrice`，保留 `supplyPrice`。

## 三、在场财务台账

### 3.1 实体

`PresenceFinanceEntry`（表 `presence_finance_entries`）与业务表完全解耦，不设外键，只保留业务快照字段：

- `id`
- `dedupeKey`：唯一键，保证同一笔财务事件只入账一次
- `month`：归属会计月份 `yyyy-MM`
- `entryDate`：财务事件发生日
- `account`：`CASH` / `REVENUE` / `TRAINER_COST`
- `eventType`：`CASH_IN` / `CASH_REFUND` / `RECOGNIZE` / `REVERSAL` / `SETTLEMENT`
- `category`：`COURSE` / `MEMBER_CARD` / `WAITLIST` / `COMMUNITY_FEE` / `TRAINER`
- `amountFen`：带符号金额（分）
- 业务快照：`orderId`、`orderNo`、`courseId`、`courseName`、`memberCardId`、`cardName`、`communityId`、`communityName`、`hostUserId`、`hostName`、`settlementId`、`trainerId`、`trainerName`
- 归属快照：`orgId`、`orgName`
- `remark`
- `createdAt`

`PresenceFinancePeriod`（表 `presence_finance_periods`）：

- `month` 主键
- `status`：`OPEN` / `CLOSED`
- `closedAt`、`closedBy`
- `updatedAt`

### 3.2 记账规则

每笔业务事件生成财务流水，报表只读流水：

1. 收款（COURSE / WAITLIST / MEMBER_CARD）：
   - `CASH / CASH_IN`，金额为实付（分，正数）。
2. 收款（COMMUNITY）：
   - `CASH / CASH_IN` 全额（分，正数）。
   - `REVENUE / RECOGNIZE / COMMUNITY_FEE` 10% 手续费（正数）。
   - 90% 代收款不记收入，由「社群现金 − 手续费收入」推导为应结主理人负债。
3. 课程收入确认：
   - 按课程 `startDate → endDate` 的天数均摊实付（分），每日一条 `REVENUE / RECOGNIZE / COURSE`。
   - 单日课当天全额确认。
   - 每天先取 `floor(总额 / 天数)`，尾差放在最后一天。
   - 付费日晚于开课日的，从付费当日起确认。
4. 会员卡收入确认：
   - 按会员卡 `startDate → endDate` 同规则逐日确认，分类为 `MEMBER_CARD`。
5. 候补：
   - 付款后只产生现金流水，不确认收入，推导为预收；转正为 COURSE 后按课程规则确认。
6. 退款：
   - 先产生 `CASH / CASH_REFUND` 负数流水（退款金额）。
   - 课程/会员卡：按「实付 − 退款」净额重算，退款日生成 `REVENUE / REVERSAL` 调整已确认与应确认的差额；退款日之后按净额继续确认。
   - 社群：生成 `REVENUE / REVERSAL / COMMUNITY_FEE` 负数流水，退回 10% 手续费。
   - 历史已关账月份不修改，冲减流水落在退款当月。
7. 导师结算：
   - 按 `Settlement` 生成 `TRAINER_COST / SETTLEMENT / TRAINER` 成本流水，金额取 `adjustedAmount ?? amount`。
   - 结算金额被人工调整时，补一条差额流水，保证台账累计等于最新结算金额。

### 3.3 台账生成与自动关账

- `ensureMonth(month)`：对未关账月份，先清空该月台账，再按业务快照确定性重建，保证幂等且可反映当月退款/改期。
- 已关账月份：`ensureMonth` 直接跳过，永不重写。
- 报表读取前调用 `ensureMonth`，确保当月末生成的日期也补齐。
- 自动关账：每日 00:10 定时任务，把所有早于当前月且仍为 `OPEN` 的月份补齐后置为 `CLOSED`；首次运行可补关多个历史月份。
- 台账起始月份取 `SystemConfig.presence_finance_start_month`，未配置时取最早已支付订单所在月。
- 台账生成写入使用事务 + 唯一键 `dedupeKey` 兜底，避免并发重复。

### 3.4 报表口径（全部来自台账）

- 本月实收 = 当月 `CASH_IN + CASH_REFUND`。
- 本月确认收入 = 当月 `REVENUE` 合计（含手续费与冲减）。
- 本月退款冲减 = 当月负数 `REVENUE` 合计。
- 期末预收余额 = 截至月末累计非社群 `CASH` − 累计非社群 `REVENUE`。
- 社群本月代收 = 当月社群 `CASH_IN + CASH_REFUND`。
- 社群手续费收入 = 当月 `COMMUNITY_FEE` 的 `REVENUE` 合计。
- 社群应结主理人 = 截至月末累计社群 `CASH` − 累计社群 `REVENUE`。
- 本月导师结算 = 当月 `TRAINER_COST` 合计。
- 在场毛利 = 本月确认收入 − 本月导师结算。

明细页：

- 报课与会员卡：按订单号聚合，展示确认区间、本月确认、累计确认、剩余预收。
- 社群代收：按社群/主理人聚合，展示本月代收、手续费、应结、退款冲减、累计应结。
- 导师结算：按导师/结算单聚合，展示课时、时薪、调整后金额、结算月份。

### 3.5 权限与页面

- 新增权限：`finance:presence:view`（看板访问）、`finance:presence:close`（手工补关/关账）。
- 默认授予：`SUPER_ADMIN`、`HQ_FINANCE`（`moduleAll('finance')` 自动包含）、`AUDITOR`（只读）。
- 现有「财务看板」菜单改名为「全业务财务看板」，路径不变。
- 新增菜单「在场业务看板」，路径 `/finance/presence`。
- 数据权限：课程/会员卡/结算按 `orgId` 快照走组织范围；社群及无组织归属数据仅对 `ALL` 范围账号展示。

## 四、边界

- 社群退款沿用现有全额退款链路，不支持部分退款。
- 社群 90% 代收款本期只出应结报表，不建设打款流水；后续可在此台账上增加 `HOST_PAYOUT` 事件。
- 课程改期只影响未关账月份；已关账月份保留原确认结果。
- 现有「全业务财务看板」的口径与实现不改，两套看板独立。
