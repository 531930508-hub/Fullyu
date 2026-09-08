import {
  PrismaClient,
  type ApprovalBizType,
  type ApprovalFlowScope,
  type ApprovalNodeMode,
  type ExpenseCategory,
  type RevenueSourceKey,
  type RevenueSourceStatus,
} from '@prisma/client'

/**
 * 第 2 批业务基础数据：收入数据源、审批流规则、进销存档案与初始库存、演示收支。
 *
 * 单独成文件是因为这批数据只跟进销存/财务/审批流三个新模块相关，
 * 混进 seed.ts 会让那份本来就长的账号与权限初始化更难读。
 *
 * 审批人一律填手机号（AdminUser.username）：重新 seed 后 cuid 会变，
 * 手机号不会，这样流程节点不会被打成空审批人。
 */

/** 收入数据源：SELF 已打通可自动抽，其余等对接 */
const REVENUE_SOURCES: {
  key: RevenueSourceKey
  name: string
  intro: string
  status: RevenueSourceStatus
  mode: string
  cron: string
  note: string
  sortOrder: number
}[] = [
  {
    key: 'SELF',
    name: '福愈小程序',
    intro: '本系统课程与会员卡订单，按 订单→课程→场馆→门店 归集',
    status: 'CONNECTED',
    mode: '本库直读',
    cron: '每日 02:00 自动，可手动补抽',
    note: '会员卡订单没有场馆归属，不计入任何门店',
    sortOrder: 1,
  },
  {
    key: 'ONSITE',
    name: '在场系统',
    intro: '到店收银流水（理疗、零售、次卡核销）',
    status: 'PENDING',
    mode: '待对方开放接口',
    cron: '待定',
    note: '接口开放前先按月手工导入',
    sortOrder: 2,
  },
  {
    key: 'QINGLIAO',
    name: '轻疗系统',
    intro: '轻疗线上课程与套餐收入',
    status: 'PENDING',
    mode: '待对方开放接口',
    cron: '待定',
    note: '两套系统尚未打通，后续接入',
    sortOrder: 3,
  },
  {
    key: 'MANUAL',
    name: '手工补录',
    intro: '线下转账、活动收入等无系统来源的收入',
    status: 'MANUAL',
    mode: '人工录入/导入',
    cron: '—',
    note: '兜底口径，不参与自动抽取',
    sortOrder: 4,
  },
]

const SUPPLIERS = [
  { name: '广州康益医疗器械有限公司', contact: '范敏', phone: '13712340001', remark: '理疗耗材主供' },
  { name: '深圳洁净日化用品有限公司', contact: '许强', phone: '13712340002', remark: '清洁与一次性用品' },
  { name: '东莞印象礼品制造厂', contact: '何珊', phone: '13712340003', remark: '会员礼品、宣传物料' },
]

const PRODUCTS = [
  { code: 'P001', name: '一次性理疗垫巾', spec: '80×180cm / 100 张', unit: '箱', purchasePrice: 120, supplyPrice: 150, safetyStock: 10 },
  { code: 'P002', name: '艾草艾条', spec: '18×200mm / 30 支', unit: '盒', purchasePrice: 45, supplyPrice: 58, safetyStock: 20 },
  { code: 'P003', name: '推拿精油', spec: '500ml', unit: '瓶', purchasePrice: 68, supplyPrice: 88, safetyStock: 15 },
  { code: 'P004', name: '瑜伽垫（专业款）', spec: '183×61cm 6mm', unit: '张', purchasePrice: 96, supplyPrice: 128, safetyStock: 8 },
  { code: 'P005', name: '筋膜球套装', spec: '3 件套', unit: '套', purchasePrice: 32, supplyPrice: 45, safetyStock: 12 },
  { code: 'P006', name: '会员迎新礼盒', spec: '含水杯+毛巾', unit: '份', purchasePrice: 58, supplyPrice: 78, safetyStock: 30 },
]

/** 各仓库初始结存：总部备货量大，门店按周转量给 */
const INIT_STOCK: { warehouseId: string; items: { code: string; qty: number }[] }[] = [
  {
    warehouseId: 'HQ',
    items: [
      { code: 'P001', qty: 120 },
      { code: 'P002', qty: 200 },
      { code: 'P003', qty: 150 },
      { code: 'P004', qty: 60 },
      { code: 'P005', qty: 90 },
      { code: 'P006', qty: 200 },
    ],
  },
  {
    warehouseId: 'S001',
    items: [
      { code: 'P001', qty: 18 },
      { code: 'P002', qty: 35 },
      { code: 'P003', qty: 22 },
      { code: 'P006', qty: 40 },
    ],
  },
  {
    warehouseId: 'S002',
    items: [
      { code: 'P001', qty: 6 },
      { code: 'P002', qty: 12 },
      { code: 'P004', qty: 5 },
    ],
  },
  {
    warehouseId: 'S003',
    items: [
      { code: 'P001', qty: 25 },
      { code: 'P003', qty: 18 },
      { code: 'P005', qty: 14 },
    ],
  },
]

/**
 * 审批流规则。
 *
 * 同一单据类型按 sortOrder 从小到大取第一条命中的，所以重额规则要排在前面。
 * scope 区分总部与门店：门店的单子多一层分公司负责人。
 */
const FLOW_RULES: {
  bizType: ApprovalBizType
  name: string
  scope: ApprovalFlowScope
  minAmount: number | null
  maxAmount: number | null
  remark: string
  sortOrder: number
  nodes: { name: string; mode: ApprovalNodeMode; approvers: string[] }[]
}[] = [
  {
    bizType: 'PURCHASE_ORDER',
    name: '门店采购·大额（≥5000）',
    scope: 'STORE',
    minAmount: 5000,
    maxAmount: null,
    remark: '大额需分公司负责人与总部财务双签',
    sortOrder: 1,
    nodes: [
      { name: '分公司负责人', mode: 'ANY', approvers: ['13900001001', '13900002001', '13900003001'] },
      { name: '总部采购复核', mode: 'ANY', approvers: ['13900000001'] },
      { name: '总部财务审批', mode: 'ANY', approvers: ['13900000002'] },
    ],
  },
  {
    bizType: 'PURCHASE_ORDER',
    name: '门店采购·常规（<5000）',
    scope: 'STORE',
    minAmount: null,
    maxAmount: 5000,
    remark: '常规补货只需分公司负责人确认',
    sortOrder: 2,
    nodes: [
      { name: '分公司负责人', mode: 'ANY', approvers: ['13900001001', '13900002001', '13900003001'] },
      { name: '总部采购复核', mode: 'ANY', approvers: ['13900000001'] },
    ],
  },
  {
    bizType: 'PURCHASE_ORDER',
    name: '总部对外采购',
    scope: 'HQ',
    minAmount: null,
    maxAmount: null,
    remark: '总部向外部供应商下单',
    sortOrder: 3,
    nodes: [
      { name: '采购负责人', mode: 'ANY', approvers: ['13900000001'] },
      { name: '财务审批', mode: 'ANY', approvers: ['13900000002'] },
    ],
  },
  {
    bizType: 'EXPENSE_ENTRY',
    name: '费用录入·大额（≥10000）',
    scope: 'ALL',
    minAmount: 10000,
    maxAmount: null,
    remark: '大额费用需财务与集团负责人双签',
    sortOrder: 1,
    nodes: [
      { name: '总部财务审核', mode: 'ANY', approvers: ['13900000002'] },
      // 集团负责人暂用超级管理员账号，等真实负责人账号建好后在配置页改掉
      { name: '集团负责人', mode: 'ANY', approvers: ['admin'] },
    ],
  },
  {
    bizType: 'EXPENSE_ENTRY',
    name: '费用录入·常规',
    scope: 'ALL',
    minAmount: null,
    maxAmount: 10000,
    remark: '房租/人力/推广等常规支出',
    sortOrder: 2,
    nodes: [{ name: '总部财务审核', mode: 'ANY', approvers: ['13900000002'] }],
  },
  {
    bizType: 'STOCK_ADJUST',
    name: '库存调整审批',
    scope: 'ALL',
    minAmount: null,
    maxAmount: null,
    remark: '盘盈盘亏与报损都要留痕',
    sortOrder: 1,
    nodes: [
      { name: '仓管复核', mode: 'ANY', approvers: ['13900000001'] },
      { name: '财务确认', mode: 'ANY', approvers: ['13900000002'] },
    ],
  },
  {
    bizType: 'VOUCHER_GRANT',
    name: '代金券发放审批',
    scope: 'ALL',
    minAmount: null,
    maxAmount: null,
    remark: '批量发券按面额总额审批',
    sortOrder: 1,
    nodes: [{ name: '运营负责人', mode: 'ANY', approvers: ['13900000010'] }],
  },
  {
    bizType: 'ORDER_FORCE_REFUND',
    name: '强制退款审批',
    scope: 'ALL',
    minAmount: null,
    maxAmount: null,
    remark: '绕过退款规则的人工退款',
    sortOrder: 1,
    nodes: [
      { name: '客服主管', mode: 'ANY', approvers: ['13900000011'] },
      { name: '财务审批', mode: 'ANY', approvers: ['13900000002'] },
    ],
  },
]

/** 演示收支：给看板铺两个月的数，免得刚上线一片空白看不出效果 */
const DEMO_REVENUE: { orgId: string; source: RevenueSourceKey; amount: number; orderCount: number }[] = [
  { orgId: 'S001', source: 'ONSITE', amount: 186500, orderCount: 412 },
  { orgId: 'S001', source: 'QINGLIAO', amount: 42300, orderCount: 96 },
  { orgId: 'S002', source: 'ONSITE', amount: 132800, orderCount: 305 },
  { orgId: 'S002', source: 'QINGLIAO', amount: 28600, orderCount: 71 },
  { orgId: 'S003', source: 'ONSITE', amount: 98400, orderCount: 236 },
  { orgId: 'S003', source: 'MANUAL', amount: 15000, orderCount: 3 },
]

/**
 * 演示支出只铺人工录入类科目。
 * 房租与物业费按门店租金参数现算（见 Organization.baseRent/rentRate/propertyFee），
 * 这里再录一遍就会双算。
 */
const DEMO_EXPENSE: { orgId: string; category: ExpenseCategory; name: string; amount: number }[] = [
  { orgId: 'S001', category: 'LABOR', name: '', amount: 62000 },
  { orgId: 'S001', category: 'MEITUAN', name: '', amount: 12400 },
  { orgId: 'S001', category: 'OTHER', name: '水电费', amount: 5600 },
  { orgId: 'S002', category: 'LABOR', name: '', amount: 48000 },
  { orgId: 'S002', category: 'MEITUAN', name: '', amount: 8800 },
  { orgId: 'S003', category: 'LABOR', name: '', amount: 41000 },
  { orgId: 'S003', category: 'OTHER', name: '开业活动物料', amount: 9200 },
]

function monthOf(offset: number) {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() - offset, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function seedBiz(prisma: PrismaClient) {
  // 1. 收入数据源
  for (const src of REVENUE_SOURCES) {
    await prisma.revenueSourceConfig.upsert({
      where: { key: src.key },
      update: src,
      create: src,
    })
  }
  console.log(`✅ 收入数据源: ${REVENUE_SOURCES.length}`)

  // 2. 供应商（按名称判重，避免重复 seed 出一堆同名供应商）
  for (const sup of SUPPLIERS) {
    const existing = await prisma.scmSupplier.findFirst({ where: { name: sup.name } })
    if (existing) await prisma.scmSupplier.update({ where: { id: existing.id }, data: sup })
    else await prisma.scmSupplier.create({ data: sup })
  }
  console.log(`✅ 供应商: ${SUPPLIERS.length}`)

  // 3. 商品档案
  for (const prod of PRODUCTS) {
    await prisma.scmProduct.upsert({ where: { code: prod.code }, update: prod, create: prod })
  }
  const products = await prisma.scmProduct.findMany({ select: { id: true, code: true } })
  const productIdOf = new Map(products.map((p) => [p.code, p.id]))
  console.log(`✅ 商品档案: ${PRODUCTS.length}`)

  // 4. 初始库存：只在没有结存记录时铺一次，避免重跑 seed 把实际库存冲掉
  let stockRows = 0
  for (const group of INIT_STOCK) {
    for (const item of group.items) {
      const productId = productIdOf.get(item.code)
      if (!productId) continue
      const existing = await prisma.stockBalance.findUnique({
        where: { warehouseId_productId: { warehouseId: group.warehouseId, productId } },
      })
      if (existing) continue
      await prisma.stockBalance.create({
        data: { warehouseId: group.warehouseId, productId, qty: item.qty },
      })
      await prisma.stockLedger.create({
        data: {
          warehouseId: group.warehouseId,
          productId,
          type: 'IN',
          qty: item.qty,
          ref: 'SEED-INIT',
        },
      })
      stockRows += 1
    }
  }
  console.log(`✅ 初始库存: ${stockRows} 条`)

  // 5. 审批流规则（整单重建，保证节点顺序与审批人跟这份定义一致）
  for (const rule of FLOW_RULES) {
    const existing = await prisma.approvalFlowRule.findFirst({
      where: { bizType: rule.bizType, name: rule.name },
    })
    const data = {
      bizType: rule.bizType,
      name: rule.name,
      scope: rule.scope,
      minAmount: rule.minAmount,
      maxAmount: rule.maxAmount,
      enabled: true,
      remark: rule.remark,
      sortOrder: rule.sortOrder,
    }
    const nodes = {
      create: rule.nodes.map((node, index) => ({
        name: node.name,
        mode: node.mode,
        approvers: node.approvers,
        sortOrder: index,
      })),
    }
    if (existing) {
      await prisma.approvalFlowNode.deleteMany({ where: { ruleId: existing.id } })
      await prisma.approvalFlowRule.update({ where: { id: existing.id }, data: { ...data, nodes } })
    } else {
      await prisma.approvalFlowRule.create({ data: { ...data, nodes } })
    }
  }
  console.log(`✅ 审批流规则: ${FLOW_RULES.length}`)

  // 6. 演示收支：当月与上月各一份，只在该月没数时补
  const months = [monthOf(0), monthOf(1)]
  let revenueRows = 0
  let expenseRows = 0
  for (const month of months) {
    const hasRevenue = await prisma.revenueRecord.count({ where: { month } })
    if (!hasRevenue) {
      await prisma.revenueRecord.createMany({
        data: DEMO_REVENUE.map((row) => ({
          month,
          orgId: row.orgId,
          source: row.source,
          amount: row.amount,
          orderCount: row.orderCount,
          way: 'IMPORT' as const,
          remark: '演示数据（手工导入）',
        })),
      })
      revenueRows += DEMO_REVENUE.length
    }
    const hasExpense = await prisma.expenseEntry.count({ where: { month } })
    if (!hasExpense) {
      await prisma.expenseEntry.createMany({
        data: DEMO_EXPENSE.map((row) => ({
          month,
          orgId: row.orgId,
          category: row.category,
          name: row.name,
          amount: row.amount,
          source: 'IMPORT' as const,
          remark: '演示数据（批量导入）',
          status: 'EFFECTIVE' as const,
          createdBy: '13900000002',
          createdByName: '周雅琪',
        })),
      })
      expenseRows += DEMO_EXPENSE.length
    }
  }
  console.log(`✅ 演示收入 ${revenueRows} 条 / 演示支出 ${expenseRows} 条`)

  // 7. 场馆归属：没挂门店的场馆收入无法归集，统一挂到福田店保证抽取链路能跑通
  const orphanVenues = await prisma.venue.updateMany({
    where: { orgId: null },
    data: { orgId: 'S001' },
  })
  if (orphanVenues.count) console.log(`✅ 场馆补挂门店: ${orphanVenues.count}`)
}
