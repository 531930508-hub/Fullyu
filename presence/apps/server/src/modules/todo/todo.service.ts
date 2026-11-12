import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import {
  ADJUST_REASON_NAMES,
  BIZ_TYPE_META,
  EXPENSE_CATEGORY_NAMES,
  hasPermission,
  isBelowSafety,
  orderAmountToYuan,
  orderStatusLabel,
  type ApprovalBizContext,
  type ApprovalContextItem,
  type ApprovalContextOrder,
  type ApprovalContextRow,
  type ApprovalDetailResult,
  type RefundDetailResult,
  type TodoCounts,
  type TodoFlowItem,
  type TodoItem,
  type TodoListResult,
} from '@fullyu/shared'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { buildOrgScope } from '../../common/utils/data-scope.util'
import type { AdminContext } from '../auth/admin-jwt.strategy'
import { ApprovalService } from '../approval/approval.service'

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : '')

const itemNameOf = (order: {
  orderType: string
  course?: { title: string } | null
  community?: { name: string } | null
  memberCardProduct?: { name: string } | null
}) => {
  if (order.orderType === 'COURSE' || order.orderType === 'WAITLIST') {
    return order.course?.title || '课程'
  }
  if (order.orderType === 'COMMUNITY') return order.community?.name || '社群年费'
  if (order.orderType === 'MEMBER_CARD') return order.memberCardProduct?.name || '会员卡'
  return '订单'
}

/**
 * 统一待办中心。
 *
 * 每个来源独立判权限：没有对应权限就不查库、不返回条目，
 * 因此 /todos 本身只要求登录，不会把采购、店长、社群运营拦在门外。
 *
 * 审批与退款刻意分成两类：
 * - 审批是「等我表决」，点开就能同意/驳回；
 * - 退款是「已提交网关、等退款结果」，只能跟进，不能在这里重复发起退款。
 * 之前工作台把两类混成一个「退款待办」并直接跳订单页，就是这次要修的问题。
 */
@Injectable()
export class TodoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalService: ApprovalService,
  ) {}

  // ===== 聚合列表 =====

  async list(admin: AdminContext): Promise<TodoListResult> {
    const can = (code: string) => hasPermission(admin.permissions, code)

    const canReviewTrainer = can('trainer:create') || can('trainer:update')
    const canReviewProposal = can('course:create') || can('course:update')

    const [approvals, refunds, community, stock, trainerApply, courseProposal] = await Promise.all([
      can('flow:todo:view') ? this.loadApprovals(admin) : Promise.resolve([]),
      can('order:view') ? this.loadRefunds(admin) : Promise.resolve([]),
      can('community:view') ? this.loadCommunity() : Promise.resolve([]),
      can('scm:stock:view') ? this.loadStock(admin) : Promise.resolve([]),
      canReviewTrainer ? this.loadTrainerApplications() : Promise.resolve([]),
      canReviewProposal ? this.loadCourseProposals() : Promise.resolve([]),
    ])

    const items = [
      ...approvals,
      ...refunds,
      ...community,
      ...stock,
      ...trainerApply,
      ...courseProposal,
    ].sort(
      (a, b) =>
        Number(b.urgent) - Number(a.urgent) || a.createdAt.localeCompare(b.createdAt),
    )

    const [done, submitted] = can('flow:todo:view')
      ? await Promise.all([
          this.approvalService.doneCount(admin),
          this.approvalService.submittedCount(admin),
        ])
      : [0, 0]

    const counts: TodoCounts = {
      all: items.length,
      approval: approvals.length,
      refund: refunds.length,
      community: community.length,
      stock: stock.length,
      trainerApply: trainerApply.length,
      courseProposal: courseProposal.length,
      done,
      submitted,
    }

    return { counts, items, generatedAt: new Date().toISOString() }
  }

  /** 工作台只取前几条做预览，不重复拉完整聚合 */
  async preview(admin: AdminContext, limit = 4) {
    const result = await this.list(admin)
    return { counts: result.counts, items: result.items.slice(0, limit) }
  }

  /**
   * 只数条数，供侧边栏红点使用。
   * 不构造条目、不带关联查询，避免每次切页都跑一遍完整聚合。
   */
  async counts(admin: AdminContext): Promise<TodoCounts> {
    const can = (code: string) => hasPermission(admin.permissions, code)
    const scope = can('scm:stock:view') || can('order:view')
      ? await buildOrgScope(this.prisma, admin)
      : null

    const canReviewTrainer = can('trainer:create') || can('trainer:update')
    const canReviewProposal = can('course:create') || can('course:update')

    const [approval, refund, community, stockBalances, trainerApply, courseProposal] = await Promise.all([
      can('flow:todo:view') ? this.approvalService.todoCount(admin) : 0,
      can('order:view')
        ? this.prisma.order.count({
            where: {
              status: 'REFUNDING',
              ...(scope && !scope.unrestricted
                ? { course: { venue: { orgId: { in: scope.orgIds ?? [] } } } }
                : {}),
            },
          })
        : 0,
      can('community:view')
        ? this.prisma.communityJoinRequest.count({ where: { status: 'PENDING' } })
        : 0,
      can('scm:stock:view')
        ? this.prisma.stockBalance.findMany({
            where: scope ? scope.toWhere('ownerOrgId') : {},
            select: { qty: true, product: { select: { safetyStock: true } } },
          })
        : [],
      canReviewTrainer
        ? this.prisma.trainerProposal.count({ where: { status: 'PENDING' } })
        : 0,
      canReviewProposal
        ? this.prisma.courseProposal.count({ where: { status: { in: ['SUBMITTED', 'REVIEWING'] } } })
        : 0,
    ])

    const stock = stockBalances.filter((b) => isBelowSafety(Number(b.qty), b.product.safetyStock)).length
    const [done, submitted] = can('flow:todo:view')
      ? await Promise.all([
          this.approvalService.doneCount(admin),
          this.approvalService.submittedCount(admin),
        ])
      : [0, 0]
    return {
      all: approval + refund + community + stock + trainerApply + courseProposal,
      approval,
      refund,
      community,
      stock,
      trainerApply,
      courseProposal,
      done,
      submitted,
    }
  }

  // ===== 流程维度：我的已办 / 我提交的 =====

  /** 我的已办：任一节点上有我的表决记录（不看整单是否结束） */
  async done(admin: AdminContext): Promise<TodoFlowItem[]> {
    const can =
      hasPermission(admin.permissions, 'flow:todo:view') ||
      hasPermission(admin.permissions, 'flow:instance:view')
    if (!can) return []
    return this.toFlowItems(await this.approvalService.myDone(admin), admin.username)
  }

  /** 我提交的：发起人是我，任何状态都列出来，便于跟进整条流程 */
  async submitted(admin: AdminContext): Promise<TodoFlowItem[]> {
    return this.toFlowItems(await this.approvalService.mySubmitted(admin), admin.username)
  }

  /** 审批实例 DTO → 流程维度条目（补组织名、我的表决结果） */
  private async toFlowItems(
    rows: Awaited<ReturnType<ApprovalService['myDone']>>,
    username: string,
  ): Promise<TodoFlowItem[]> {
    if (!rows.length) return []

    const orgIds = Array.from(new Set(rows.map((r) => r.orgId).filter((v): v is string => !!v)))
    const orgs = orgIds.length
      ? await this.prisma.organization.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, name: true, shortName: true },
        })
      : []
    const orgMap = new Map(orgs.map((o) => [o.id, o.shortName || o.name]))

    return rows.map((row) => {
      const meta = BIZ_TYPE_META[row.bizType as keyof typeof BIZ_TYPE_META]
      const node = row.status === 'PENDING' ? row.nodes[row.currentIndex] : undefined
      const myDecisions = row.nodes
        .flatMap((n) => n.decisions)
        .filter((d) => d.approver === username)
      const last = myDecisions[myDecisions.length - 1]
      return {
        id: row.id,
        bizType: row.bizType,
        bizLabel: meta?.text || row.bizType,
        title: meta?.text || '审批单',
        summary: row.summary,
        amount: Number(row.amount) || null,
        requesterName: row.requesterName || row.requester || '系统',
        orgName: row.orgId ? orgMap.get(row.orgId) || '' : '',
        flowName: row.flowName,
        status: row.status,
        nodeText: node ? `${row.currentIndex + 1}/${row.nodes.length} ${node.name}` : '',
        createdAt: iso(row.createdAt),
        finishedAt: row.finishedAt ? iso(row.finishedAt) : null,
        myAction: last?.action ?? null,
        myComment: last?.comment ?? '',
        myDecidedAt: last ? iso(last.createdAt) : null,
      }
    })
  }

  private async loadApprovals(admin: AdminContext): Promise<TodoItem[]> {
    const rows = await this.approvalService.myTodo(admin)
    if (!rows.length) return []

    const orgIds = Array.from(new Set(rows.map((r) => r.orgId).filter((v): v is string => !!v)))
    const orgs = orgIds.length
      ? await this.prisma.organization.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, name: true, shortName: true },
        })
      : []
    const orgMap = new Map(orgs.map((o) => [o.id, o.shortName || o.name]))

    return rows.map((row) => {
      const meta = BIZ_TYPE_META[row.bizType as keyof typeof BIZ_TYPE_META]
      const node = row.nodes[row.currentIndex]
      return {
        id: `approval-${row.id}`,
        source: 'APPROVAL',
        action: 'APPROVE',
        bizType: row.bizType,
        bizLabel: meta?.text || row.bizType,
        title: meta?.text || '审批单',
        summary: row.summary,
        amount: Number(row.amount) || null,
        requesterName: row.requesterName || row.requester || '系统',
        orgName: row.orgId ? orgMap.get(row.orgId) || '' : '',
        createdAt: iso(row.createdAt),
        urgent: true,
        nodeText: node ? `${row.currentIndex + 1}/${row.nodes.length} ${node.name}` : '',
        detailId: row.id,
        hint: node?.mode === 'ALL' ? '会签节点，需全部审批人同意' : '或签节点，一人同意即可',
      }
    })
  }

  private async loadRefunds(admin: AdminContext): Promise<TodoItem[]> {
    const scope = await buildOrgScope(this.prisma, admin)
    const where: Prisma.OrderWhereInput = { status: 'REFUNDING' }
    if (!scope.unrestricted) {
      // 退款订单按 订单→课程→场地→组织 归属；非门店业务的订单不进门店待办
      where.course = { venue: { orgId: { in: scope.orgIds ?? [] } } }
    }

    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: {
        user: { select: { nickname: true, phone: true } },
        course: { select: { title: true, venue: { select: { orgId: true } } } },
        community: { select: { name: true } },
        memberCardProduct: { select: { name: true } },
      },
    })
    if (!orders.length) return []

    const orgIds = Array.from(
      new Set(
        orders
          .map((o) => o.course?.venue?.orgId)
          .filter((v): v is string => !!v),
      ),
    )
    const orgs = orgIds.length
      ? await this.prisma.organization.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, name: true, shortName: true },
        })
      : []
    const orgMap = new Map(orgs.map((o) => [o.id, o.shortName || o.name]))

    return orders.map((o) => {
      const yuan = orderAmountToYuan(o.orderType, Number(o.actualPaid))
      const refundYuan =
        o.refundAmount == null ? null : orderAmountToYuan(o.orderType, Number(o.refundAmount))
      const userName = o.user?.nickname || o.user?.phone || '用户'
      const itemName = itemNameOf(o)
      return {
        id: `refund-${o.id}`,
        source: 'REFUND',
        action: 'NAVIGATE',
        bizType: 'REFUND',
        bizLabel: '退款跟进',
        title: `退款跟进 · ${o.orderNo}`,
        summary: `${userName} · ${itemName} · 实付 ¥${yuan.toFixed(2)}`,
        amount: yuan,
        requesterName: userName,
        orgName: orgMap.get(o.course?.venue?.orgId || '') || '',
        createdAt: iso(o.createdAt),
        urgent: true,
        nodeText: '',
        detailId: o.id,
        hint: refundYuan == null
          ? '已提交退款，等待支付网关返回结果'
          : `申请退款 ¥${refundYuan.toFixed(2)}，等待支付网关返回结果`,
        link: `/sales/orders?focus=${o.id}`,
      }
    })
  }

  /**
   * 导师入驻申请：待教务审核。
   * 审核动作在「导师入驻」页完成，所以这里用 NAVIGATE，而不是在待办抽屉里直接放按钮。
   */
  private async loadTrainerApplications(): Promise<TodoItem[]> {
    const rows = await this.prisma.trainerProposal.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: { id: true, form: true, createdAt: true },
    })
    if (!rows.length) return []
    return rows.map((row) => {
      const form = (row.form || {}) as any
      const realName = form.realName || '申请人'
      const specialties: string[] = Array.isArray(form.specialties) ? form.specialties : []
      return {
        id: `trainer-apply-${row.id}`,
        source: 'TRAINER_APPLY',
        action: 'NAVIGATE',
        bizType: 'TRAINER_APPLY',
        bizLabel: '导师入驻',
        title: `${realName} 申请入驻`,
        summary: [form.city, specialties.slice(0, 3).join('/'), form.experienceYears ? `${form.experienceYears} 年经验` : '']
          .filter(Boolean)
          .join(' · ') || '待教务核对资料',
        amount: null,
        requesterName: realName,
        orgName: '',
        createdAt: iso(row.createdAt),
        urgent: false,
        nodeText: '',
        detailId: row.id,
        link: `/education/trainer-applications?focus=${row.id}`,
      }
    })
  }

  /** 课程提案：待受理（SUBMITTED）与审核中（REVIEWING），两类都算教务的待办 */
  private async loadCourseProposals(): Promise<TodoItem[]> {
    const rows = await this.prisma.courseProposal.findMany({
      where: { status: { in: ['SUBMITTED', 'REVIEWING'] } },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        durationMinutes: true,
        totalSessions: true,
        requestedMaxCapacity: true,
        trainer: { select: { displayName: true } },
      },
    })
    if (!rows.length) return []
    return rows.map((row) => ({
      id: `course-proposal-${row.id}`,
      source: 'COURSE_PROPOSAL',
      action: 'NAVIGATE',
      bizType: 'COURSE_PROPOSAL',
      bizLabel: '课程提案',
      title: `《${row.title || '未命名课程'}》课程提案`,
      summary: `${row.durationMinutes} 分钟 × ${row.totalSessions} 节 · 建议 ${row.requestedMaxCapacity || '-'} 人`,
      amount: null,
      requesterName: row.trainer?.displayName || '导师',
      orgName: '',
      createdAt: iso(row.createdAt),
      urgent: false,
      nodeText: row.status === 'REVIEWING' ? '教务审核中' : '待受理',
      detailId: row.id,
      link: `/education/course-proposals?focus=${row.id}`,
    }))
  }

  private async loadCommunity(): Promise<TodoItem[]> {
    const rows = await this.prisma.communityJoinRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: { community: { select: { id: true, name: true } } },
    })
    if (!rows.length) return []

    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.userId) } },
      select: { id: true, nickname: true, phone: true },
    })
    const userMap = new Map(users.map((u) => [u.id, u]))

    return rows.map((r) => {
      const user = userMap.get(r.userId)
      const userName = user?.nickname || user?.phone || '用户'
      return {
        id: `community-${r.id}`,
        source: 'COMMUNITY',
        action: 'REVIEW',
        bizType: 'JOIN_REQUEST',
        bizLabel: '入群申请',
        title: `${r.community?.name || '社群'} · 入群申请`,
        summary: r.note?.trim() ? `申请理由：${r.note.trim()}` : `${userName} 申请加入社群`,
        amount: null,
        requesterName: userName,
        orgName: '',
        createdAt: iso(r.createdAt),
        urgent: false,
        nodeText: '',
        detailId: r.id,
        link: '/community/workspace',
      }
    })
  }

  private async loadStock(admin: AdminContext): Promise<TodoItem[]> {
    const scope = await buildOrgScope(this.prisma, admin)
    const balances = await this.prisma.stockBalance.findMany({
      where: scope.toWhere('ownerOrgId'),
      include: {
        product: { select: { name: true, unit: true, safetyStock: true } },
      },
      orderBy: { qty: 'asc' },
      take: 100,
    })
    const alerts = balances.filter((b) => isBelowSafety(Number(b.qty), b.product.safetyStock))
    if (!alerts.length) return []

    const warehouses = await this.prisma.organization.findMany({
      where: { id: { in: Array.from(new Set(alerts.map((a) => a.warehouseId))) } },
      select: { id: true, name: true, shortName: true },
    })
    const whMap = new Map(warehouses.map((w) => [w.id, w.shortName || w.name]))

    return alerts.map((b) => {
      const unit = b.product.unit || ''
      return {
        id: `stock-${b.warehouseId}-${b.productId}`,
        source: 'STOCK',
        action: 'NAVIGATE',
        bizType: 'STOCK_ALERT',
        bizLabel: '库存预警',
        title: `${b.product.name} 低于安全库存`,
        summary: `${whMap.get(b.warehouseId) || '仓库'} 剩余 ${Number(b.qty)}${unit}，安全库存 ${b.product.safetyStock}${unit}`,
        amount: null,
        requesterName: '',
        orgName: whMap.get(b.warehouseId) || '',
        createdAt: iso(b.updatedAt),
        urgent: Number(b.qty) <= 0,
        nodeText: '',
        detailId: b.warehouseId,
        hint: Number(b.qty) <= 0 ? '已无库存' : `还需补 ${b.product.safetyStock - Number(b.qty)}${unit}`,
        link: '/scm/stock',
      }
    })
  }

  // ===== 审批详情 =====

  /**
   * 待办中心专用的审批详情。
   * 审批人可能只有 flow:todo:view 而没有 flow:instance:view，
   * 不能复用 /approvals/instances/:id，否则点开就 403。
   */
  async approvalDetail(admin: AdminContext, id: string): Promise<ApprovalDetailResult> {
    const instance = await this.approvalService.detail(id)
    const payloadRow = await this.prisma.approvalInstance.findUnique({
      where: { id },
      select: { payload: true },
    })

    const node = instance.nodes[instance.currentIndex]
    const approvers = node?.approvers ?? []
    const isCurrentApprover =
      hasPermission(admin.permissions, 'flow:todo:view') && approvers.includes(admin.username)
    const isRequester = instance.requester === admin.username
    const isViewer = hasPermission(admin.permissions, 'flow:instance:view')
    if (!isCurrentApprover && !isRequester && !isViewer) {
      throw new BusinessException('无权查看该审批单', 4216, 403)
    }

    const decided = (node?.decisions ?? []).some((d) => d.approver === admin.username)
    const canApprovePerm = hasPermission(admin.permissions, 'flow:todo:approve')
    const canApprove =
      instance.status === 'PENDING' &&
      canApprovePerm &&
      isCurrentApprover &&
      !!node &&
      !decided

    let reason = ''
    if (instance.status !== 'PENDING') reason = '单据已结束，仅可查看记录'
    else if (!canApprovePerm) reason = '缺少「同意/驳回审批」权限'
    else if (!isCurrentApprover) reason = '你不是当前节点的审批人'
    else if (decided) reason = '你已处理过当前节点'

    const canCancel = instance.status === 'PENDING' && isRequester

    const context = await this.buildContext(instance, payloadRow?.payload ?? null)

    return { instance, context, canApprove, canCancel, reason }
  }

  private async buildContext(
    instance: {
      bizType: string
      bizId: string
      summary: string
      amount: number
      requesterName: string
      createdAt: string | Date
    },
    rawPayload: Prisma.JsonValue | null,
  ): Promise<ApprovalBizContext> {
    const payload = (rawPayload ?? {}) as Record<string, any>
    const meta = BIZ_TYPE_META[instance.bizType as keyof typeof BIZ_TYPE_META]
    const fallback: ApprovalBizContext = {
      title: meta?.text || '审批单',
      rows: [
        { label: '单据号', value: instance.bizId || '—' },
        { label: '摘要', value: instance.summary || '—' },
        { label: '申请人', value: instance.requesterName || '—' },
      ],
      items: [],
    }

    try {
      switch (instance.bizType) {
        case 'PURCHASE_ORDER':
          return await this.contextPurchase(instance.bizId, fallback)
        case 'EXPENSE_ENTRY':
          return await this.contextExpense(instance.bizId, fallback)
        case 'STOCK_ADJUST':
          return await this.contextStockAdjust(instance.bizId, fallback)
        case 'VOUCHER_GRANT':
          return await this.contextVoucher(payload, fallback)
        case 'ORDER_FORCE_REFUND':
          return await this.contextForceRefund(payload, fallback)
        default:
          return fallback
      }
    } catch {
      // 业务单据被删或数据异常时不挡审批，退回通用信息
      return fallback
    }
  }

  private async contextPurchase(
    bizId: string,
    fallback: ApprovalBizContext,
  ): Promise<ApprovalBizContext> {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: bizId },
      include: { items: true, supplier: { select: { name: true } } },
    })
    if (!po) return fallback
    const buyer = await this.prisma.organization.findUnique({
      where: { id: po.buyerId },
      select: { name: true, shortName: true },
    })
    const rows: ApprovalContextRow[] = [
      { label: '采购单号', value: po.id },
      { label: '采购方', value: buyer?.shortName || buyer?.name || po.buyerId },
      { label: '供货方', value: po.supplierName || po.supplier?.name || '—' },
      { label: '采购总额', value: `¥${Number(po.totalAmount).toFixed(2)}` },
      { label: '备注', value: po.remark || '—' },
    ]
    const items: ApprovalContextItem[] = po.items.map((it) => ({
      name: it.name,
      spec: it.spec,
      unit: it.unit,
      qty: Number(it.qty),
      price: Number(it.price),
      amount: Number(it.price) * Number(it.qty),
    }))
    return { title: `采购单 ${po.id}`, rows, items, link: '/scm/purchase-orders' }
  }

  private async contextExpense(
    bizId: string,
    fallback: ApprovalBizContext,
  ): Promise<ApprovalBizContext> {
    const entry = await this.prisma.expenseEntry.findUnique({ where: { id: bizId } })
    if (!entry) return fallback
    const org = await this.prisma.organization.findUnique({
      where: { id: entry.orgId },
      select: { name: true, shortName: true },
    })
    const category =
      EXPENSE_CATEGORY_NAMES[entry.category as keyof typeof EXPENSE_CATEGORY_NAMES] ||
      entry.category
    const rows: ApprovalContextRow[] = [
      { label: '所属组织', value: org?.shortName || org?.name || entry.orgId },
      { label: '所属月份', value: entry.month },
      { label: '费用科目', value: entry.name || category },
      { label: '金额', value: `¥${Number(entry.amount).toFixed(2)}` },
      { label: '备注', value: entry.remark || '—' },
    ]
    return { title: `${org?.shortName || org?.name || ''} ${entry.month} 费用录入`, rows, items: [], link: '/finance/expenses' }
  }

  private async contextStockAdjust(
    bizId: string,
    fallback: ApprovalBizContext,
  ): Promise<ApprovalBizContext> {
    const adjust = await this.prisma.stockAdjust.findUnique({
      where: { id: bizId },
      include: { items: true },
    })
    if (!adjust) return fallback
    const wh = await this.prisma.organization.findUnique({
      where: { id: adjust.warehouseId },
      select: { name: true, shortName: true },
    })
    const reason =
      ADJUST_REASON_NAMES[adjust.reason as keyof typeof ADJUST_REASON_NAMES] || adjust.reason
    const rows: ApprovalContextRow[] = [
      { label: '调整单号', value: adjust.id },
      { label: '仓库', value: wh?.shortName || wh?.name || adjust.warehouseId },
      { label: '调整原因', value: reason },
      { label: '影响金额', value: `¥${Number(adjust.totalAmount).toFixed(2)}` },
      { label: '备注', value: adjust.remark || '—' },
    ]
    const items: ApprovalContextItem[] = adjust.items.map((it) => ({
      name: it.name,
      spec: `账面 ${it.beforeQty} → 实盘 ${it.afterQty}`,
      unit: it.unit,
      qty: Number(it.diffQty),
      price: Number(it.price),
      amount: Math.abs(Number(it.diffQty)) * Number(it.price),
    }))
    return { title: `库存调整 ${adjust.id}`, rows, items, link: '/scm/adjust' }
  }

  private async contextVoucher(
    payload: Record<string, any>,
    fallback: ApprovalBizContext,
  ): Promise<ApprovalBizContext> {
    const rows = Array.isArray(payload.rows) ? payload.rows : []
    const first = rows[0] || {}
    const count = Number(payload.count) || rows.length
    const modeText =
      first.mode === 'REDUCE_TO'
        ? `减至 ¥${Number(first.targetPrice ?? 0).toFixed(2)}`
        : `减 ¥${Number(first.amount ?? 0).toFixed(2)}`
    const expiresAt = first.expiresAt ? iso(new Date(first.expiresAt)) : ''
    const contextRows: ApprovalContextRow[] = [
      { label: '发放人数', value: `${count} 人` },
      { label: '优惠方式', value: modeText },
      { label: '发放后有效期', value: expiresAt ? expiresAt.slice(0, 10) : '—' },
      { label: '适用课程', value: first.applicableAll ? '全部课程' : `${(first.applicableCourseIds ?? []).length} 门指定课程` },
    ]
    return { title: '代金券发放', rows: contextRows, items: [], link: '/sales/vouchers' }
  }

  private async contextForceRefund(
    payload: Record<string, any>,
    fallback: ApprovalBizContext,
  ): Promise<ApprovalBizContext> {
    const orderId = String(payload.orderId || '')
    if (!orderId) return fallback
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { nickname: true, phone: true } },
        course: { select: { title: true } },
        community: { select: { name: true } },
        memberCardProduct: { select: { name: true } },
      },
    })
    if (!order) return fallback

    const actualPaid = orderAmountToYuan(order.orderType, Number(order.actualPaid))
    const refundYuan =
      order.refundAmount == null ? null : orderAmountToYuan(order.orderType, Number(order.refundAmount))
    const applyAmount = Number(payload.refundAmount) || 0
    const userName = order.user?.nickname || order.user?.phone || '用户'
    const itemName = itemNameOf(order)
    const statusLabel = orderStatusLabel(order.status) || order.status

    const snapshot: ApprovalContextOrder = {
      id: order.id,
      orderNo: order.orderNo,
      userName,
      itemName,
      orderType: order.orderType,
      status: order.status,
      statusLabel,
      actualPaid,
      refundAmount: refundYuan,
      createTime: iso(order.createdAt),
      payTime: order.paymentTime ? iso(order.paymentTime) : null,
    }

    const rows: ApprovalContextRow[] = [
      { label: '退款金额', value: applyAmount > 0 ? `¥${applyAmount.toFixed(2)}（部分退）` : `全额 ¥${actualPaid.toFixed(2)}` },
      { label: '退款原因', value: String(payload.reason || '强制退款') },
      { label: '订单实付', value: `¥${actualPaid.toFixed(2)}` },
      { label: '订单状态', value: statusLabel },
      { label: '下单时间', value: snapshot.createTime.slice(0, 16).replace('T', ' ') },
      { label: '支付时间', value: snapshot.payTime ? snapshot.payTime.slice(0, 16).replace('T', ' ') : '—' },
    ]
    return {
      title: `订单强制退款 ${order.orderNo}`,
      rows,
      items: [],
      link: `/sales/orders?focus=${order.id}`,
      order: snapshot,
    }
  }

  // ===== 退款跟进详情 =====

  async refundDetail(admin: AdminContext, orderId: string): Promise<RefundDetailResult> {
    if (!hasPermission(admin.permissions, 'order:view')) {
      throw new BusinessException('无权查看订单', 4217, 403)
    }
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { nickname: true, phone: true } },
        course: { select: { title: true, venue: { select: { orgId: true } } } },
        community: { select: { name: true } },
        memberCardProduct: { select: { name: true } },
      },
    })
    if (!order) throw new BusinessException('订单不存在', 4202)

    const scope = await buildOrgScope(this.prisma, admin)
    const orgId = order.course?.venue?.orgId ?? null
    if (!scope.includes(orgId)) {
      throw new BusinessException('无权查看该订单', 4217, 403)
    }

    // 强制退款走审批时不改订单状态，这里主动提示是否已有审批单在跑
    const pendings = await this.prisma.approvalInstance.findMany({
      where: { bizType: 'ORDER_FORCE_REFUND', status: 'PENDING' },
      select: { id: true, payload: true },
    })
    const pending = pendings.find((p) => String((p.payload as any)?.orderId || '') === orderId)

    const actualPaid = orderAmountToYuan(order.orderType, Number(order.actualPaid))
    const originalPrice = orderAmountToYuan(order.orderType, Number(order.originalPrice))
    const refundAmount =
      order.refundAmount == null ? null : orderAmountToYuan(order.orderType, Number(order.refundAmount))

    return {
      order: {
        id: order.id,
        orderNo: order.orderNo,
        orderType: order.orderType,
        userName: order.user?.nickname || order.user?.phone || '用户',
        userPhone: order.user?.phone || '',
        itemName: itemNameOf(order),
        status: order.status,
        statusLabel: orderStatusLabel(order.status) || order.status,
        originalPrice,
        actualPaid,
        refundAmount,
        cancelReason: order.cancelReason || '',
        createTime: iso(order.createdAt),
        payTime: order.paymentTime ? iso(order.paymentTime) : null,
        refundTime: order.refundTime ? iso(order.refundTime) : null,
      },
      pendingApprovalId: pending?.id ?? null,
      link: `/sales/orders?focus=${order.id}`,
    }
  }
}
