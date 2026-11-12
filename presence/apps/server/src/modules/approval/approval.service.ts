import { Injectable, Logger } from '@nestjs/common'
import {
  ApprovalBizType,
  ApprovalDecisionAction,
  ApprovalInstanceStatus,
  Prisma,
} from '@prisma/client'
import { nodePassed, pickFlowRule, scopeOfOrgType } from '@fullyu/shared'
import { PrismaService } from '../../common/prisma.service'
import { RedisService } from '../../common/redis.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { generateDocNo } from '../../common/doc-no.helper'
import { buildOrgScope } from '../../common/utils/data-scope.util'
import type { AdminContext } from '../auth/admin-jwt.strategy'
import { PaymentService } from '../payment/payment.service'
import { StockService } from '../scm/stock.service'
import { ApprovalFlowService, toStringArray } from './approval-flow.service'

/** 发起审批的入参。业务模块只管填单据信息，命中哪条流程由引擎决定 */
export interface SubmitApprovalInput {
  bizType: ApprovalBizType
  /** 业务单据 id；代金券发放、强制退款这类无实体单据时留空 */
  bizId?: string
  summary: string
  amount?: number
  /** 发起方组织，决定命中 HQ 还是 STORE 流程 */
  orgId?: string | null
  /** 发起人 adminUser.id */
  requesterId?: string
  /** 通过后执行副作用所需的参数快照 */
  payload?: Record<string, unknown>
}

const instanceInclude = {
  nodes: {
    orderBy: { sortOrder: 'asc' },
    include: { decisions: { orderBy: { createdAt: 'asc' } } },
  },
} satisfies Prisma.ApprovalInstanceInclude

type InstanceRow = Prisma.ApprovalInstanceGetPayload<{ include: typeof instanceInclude }>

/**
 * 审批流引擎。
 *
 * 全系统一套：采购订单、费用录入、库存调整、代金券发放、订单强制退款
 * 都走 submit → 命中流程 → 逐节点推进 → 通过后执行副作用。
 *
 * 两条硬规则：
 * 1. 没命中流程时 submit 返回 null，业务侧按「免审直接生效」处理，绝不把单据卡死；
 * 2. 副作用只在最后一个节点通过后执行一次，参数取实例上的 payload 快照，
 *    这样即使期间业务数据被改动，执行的也是发起时确认过的内容。
 */
@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly flowService: ApprovalFlowService,
    private readonly paymentService: PaymentService,
    private readonly stockService: StockService,
  ) {}

  // ===== 发起 =====

  /**
   * 发起审批。
   * @returns 命中流程时返回实例；返回 null 表示免审，调用方应直接让业务生效
   */
  async submit(input: SubmitApprovalInput): Promise<InstanceRow | null> {
    // 同一订单同时只允许一个待审的强制退款申请：锁内先查重，杜绝并发重复提交
    if (input.bizType === 'ORDER_FORCE_REFUND' && input.bizId) {
      return this.redis.withLock(
        `approval:submit:ORDER_FORCE_REFUND:${input.bizId}`,
        () => this.doSubmit(input),
      )
    }
    return this.doSubmit(input)
  }

  private async doSubmit(input: SubmitApprovalInput): Promise<InstanceRow | null> {
    const amount = Number(input.amount ?? 0)
    const requester = await this.resolveRequester(input.requesterId)
    const orgId = input.orgId ?? requester.orgId ?? null
    const scope = scopeOfOrgType(await this.orgTypeOf(orgId))

    // 命中判定走 shared，与配置页的预览结果同一份逻辑
    const rules = await this.flowService.matchable(input.bizType)
    const hit = pickFlowRule(rules, input.bizType, amount, scope)
    if (!hit) return null

    if (input.bizType === 'ORDER_FORCE_REFUND' && input.bizId) {
      const pending = await this.prisma.approvalInstance.findFirst({
        where: { bizType: 'ORDER_FORCE_REFUND', bizId: input.bizId, status: 'PENDING' },
      })
      if (pending) {
        throw new BusinessException('该订单已有待审批的强制退款申请，请先处理该审批', 4028)
      }
    }

    const id = await generateDocNo(this.redis, 'AP', async (no) => {
      const exist = await this.prisma.approvalInstance.findUnique({ where: { id: no } })
      return !!exist
    })

    return this.prisma.approvalInstance.create({
      data: {
        id,
        bizType: input.bizType,
        bizId: input.bizId ?? '',
        summary: input.summary,
        amount,
        orgId,
        requester: requester.username,
        requesterName: requester.name,
        flowId: hit.id,
        flowName: hit.name,
        currentIndex: 0,
        status: 'PENDING',
        payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
        nodes: {
          // 从模板拷贝一份，后续改模板不影响在跑的单
          create: hit.nodes.map((node, index) => ({
            name: node.name,
            mode: node.mode,
            approvers: node.approvers as Prisma.InputJsonValue,
            status: index === 0 ? 'PROCESSING' : 'WAITING',
            sortOrder: index,
          })),
        },
      },
      include: instanceInclude,
    })
  }

  // ===== 查询 =====

  /** 审批记录列表。按数据行级范围过滤，店长只看得到自己门店发起的单 */
  async list(
    admin: AdminContext,
    query: { status?: ApprovalInstanceStatus; bizType?: ApprovalBizType; keyword?: string } = {},
  ) {
    const orgScope = await buildOrgScope(this.prisma, admin)
    const where: Prisma.ApprovalInstanceWhereInput = {}
    if (!orgScope.unrestricted) {
      // 组织为空的历史单（如总部代金券）只有不受限范围能看到
      where.orgId = { in: orgScope.orgIds as string[] }
    }
    if (query.status) where.status = query.status
    if (query.bizType) where.bizType = query.bizType
    if (query.keyword) {
      where.OR = [
        { id: { contains: query.keyword } },
        { summary: { contains: query.keyword } },
        { requesterName: { contains: query.keyword } },
      ]
    }
    const rows = await this.prisma.approvalInstance.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: instanceInclude,
    })
    return rows.map((row) => this.toDto(row))
  }

  async detail(id: string) {
    const row = await this.prisma.approvalInstance.findUnique({
      where: { id },
      include: instanceInclude,
    })
    if (!row) throw new BusinessException('审批单不存在', 4210)
    return this.toDto(row)
  }

  /**
   * 我的待办：当前节点的审批人里有我、且我还没表态的单。
   *
   * 节点审批人存在 Json 字段里，MySQL 上做数组包含查询很别扭，
   * 后台待办量级很小，直接取 PENDING 全量在内存里筛。
   */
  async myTodo(admin: AdminContext) {
    const rows = await this.prisma.approvalInstance.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: instanceInclude,
    })
    const mine = rows.filter((row) => {
      const node = row.nodes[row.currentIndex]
      if (!node) return false
      if (!toStringArray(node.approvers).includes(admin.username)) return false
      return !node.decisions.some((d) => d.approver === admin.username)
    })
    return mine.map((row) => this.toDto(row))
  }

  /** 首页角标：我的待办条数 */
  async todoCount(admin: AdminContext): Promise<number> {
    const list = await this.myTodo(admin)
    return list.length
  }

  /**
   * 我的已办：任一节点上有我的表决记录的单。
   *
   * 不看整单状态——我同意完、单子还在等下一级领导时，这张单也应出现在已办里，
   * 否则「我处理过什么」会凭空消失一批。
   */
  async myDone(admin: AdminContext) {
    const rows = await this.prisma.approvalInstance.findMany({
      where: { nodes: { some: { decisions: { some: { approver: admin.username } } } } },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: instanceInclude,
    })
    return rows.map((row) => this.toDto(row))
  }

  /** 我的已办条数（侧边栏/页签角标用，不构造 DTO） */
  async doneCount(admin: AdminContext): Promise<number> {
    return this.prisma.approvalInstance.count({
      where: { nodes: { some: { decisions: { some: { approver: admin.username } } } } },
    })
  }

  /** 我提交的：发起人是我，任何状态都要看到，便于跟进进度 */
  async mySubmitted(admin: AdminContext) {
    const rows = await this.prisma.approvalInstance.findMany({
      where: { requester: admin.username },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: instanceInclude,
    })
    return rows.map((row) => this.toDto(row))
  }

  async submittedCount(admin: AdminContext): Promise<number> {
    return this.prisma.approvalInstance.count({ where: { requester: admin.username } })
  }

  /** 业务单据关联的审批进度，采购单/支出单详情页画时间轴用 */
  async byBiz(bizType: ApprovalBizType, bizId: string) {
    if (!bizId) return null
    const row = await this.prisma.approvalInstance.findFirst({
      where: { bizType, bizId },
      orderBy: { createdAt: 'desc' },
      include: instanceInclude,
    })
    return row ? this.toDto(row) : null
  }

  // ===== 推进 =====

  /** 同意 */
  async approve(admin: AdminContext, id: string, comment?: string) {
    return this.decide(admin, id, 'APPROVE', comment)
  }

  /** 驳回：一票否决，整单结束 */
  async reject(admin: AdminContext, id: string, comment?: string) {
    return this.decide(admin, id, 'REJECT', comment)
  }

  private async decide(
    admin: AdminContext,
    id: string,
    action: ApprovalDecisionAction,
    comment?: string,
  ) {
    // 同一审批单串行处理：避免双击/多人同时审批产生重复表决、节点停住或副作用重复执行
    return this.redis.withLock(
      `approval:decide:${id}`,
      () => this.decideLocked(admin, id, action, comment),
      { ttlSeconds: 15 },
    )
  }

  private async decideLocked(
    admin: AdminContext,
    id: string,
    action: ApprovalDecisionAction,
    comment?: string,
  ) {
    const instance = await this.prisma.approvalInstance.findUnique({
      where: { id },
      include: instanceInclude,
    })
    if (!instance) throw new BusinessException('审批单不存在', 4210)
    if (instance.status !== 'PENDING') throw new BusinessException('该审批单已结束', 4211)

    const node = instance.nodes[instance.currentIndex]
    if (!node) throw new BusinessException('审批节点异常，请联系管理员', 4212)
    const approvers = toStringArray(node.approvers)
    if (!approvers.includes(admin.username)) {
      throw new BusinessException('您不是当前节点的审批人', 4213)
    }
    if (node.decisions.some((d) => d.approver === admin.username)) {
      throw new BusinessException('您已处理过该节点', 4214)
    }

    const approverName = (await this.resolveRequester(admin.adminId)).name
    await this.prisma.approvalDecision.create({
      data: {
        nodeId: node.id,
        approver: admin.username,
        approverName,
        action,
        comment: comment ?? '',
      },
    })

    if (action === 'REJECT') {
      await this.prisma.$transaction(async (tx) => {
        await tx.approvalInstanceNode.update({ where: { id: node.id }, data: { status: 'REJECTED' } })
        await tx.approvalInstance.update({
          where: { id },
          data: {
            status: 'REJECTED',
            finishedAt: new Date(),
            resultNote: `${approverName} 驳回${comment ? `：${comment}` : ''}`,
          },
        })
      })
      await this.writeBackBiz(instance, 'REJECTED')
      return this.detail(id)
    }

    const approvedBy = [
      ...node.decisions.filter((d) => d.action === 'APPROVE').map((d) => d.approver),
      admin.username,
    ]
    if (!nodePassed(node.mode, approvers, approvedBy)) {
      // 会签还差人，停在当前节点
      return this.detail(id)
    }

    const isLast = instance.currentIndex >= instance.nodes.length - 1
    await this.prisma.$transaction(async (tx) => {
      await tx.approvalInstanceNode.update({ where: { id: node.id }, data: { status: 'APPROVED' } })
      if (isLast) {
        await tx.approvalInstance.update({
          where: { id },
          data: { status: 'APPROVED', finishedAt: new Date() },
        })
      } else {
        const next = instance.nodes[instance.currentIndex + 1]
        await tx.approvalInstanceNode.update({ where: { id: next.id }, data: { status: 'PROCESSING' } })
        await tx.approvalInstance.update({
          where: { id },
          data: { currentIndex: instance.currentIndex + 1 },
        })
      }
    })

    if (isLast) {
      const note = await this.runEffect(instance)
      await this.prisma.approvalInstance.update({ where: { id }, data: { resultNote: note } })
    }
    return this.detail(id)
  }

  /** 发起人撤销：只能撤自己发起且还在审批中的单 */
  async cancel(admin: AdminContext, id: string) {
    const instance = await this.prisma.approvalInstance.findUnique({
      where: { id },
      include: instanceInclude,
    })
    if (!instance) throw new BusinessException('审批单不存在', 4210)
    if (instance.status !== 'PENDING') throw new BusinessException('该审批单已结束', 4211)
    if (instance.requester !== admin.username) {
      throw new BusinessException('只能撤销自己发起的审批', 4215)
    }
    await this.prisma.approvalInstance.update({
      where: { id },
      data: { status: 'CANCELLED', finishedAt: new Date(), resultNote: '发起人撤销' },
    })
    await this.writeBackBiz(instance, 'CANCELLED')
    return this.detail(id)
  }

  // ===== 副作用执行 =====

  /**
   * 审批通过后的落地动作。
   * 单条执行失败不回滚审批结论 —— 结论已是既定事实，失败原因写进 resultNote 让人工补救，
   * 否则审批人会看到「我明明点了同意却还是待审」的诡异状态。
   */
  private async runEffect(instance: InstanceRow): Promise<string> {
    try {
      const payload = (instance.payload ?? {}) as Record<string, any>
      switch (instance.bizType) {
        case 'VOUCHER_GRANT': {
          const rows = ((payload.rows as any[]) ?? []).map((r) => ({
            ...r,
            expiresAt: new Date(r.expiresAt),
          }))
          if (!rows.length) return '无待发放的代金券'
          const result = await this.prisma.voucher.createMany({ data: rows })
          return `已发放 ${result.count} 张代金券`
        }
        case 'ORDER_FORCE_REFUND': {
          const r = await this.paymentService.forceRefund(
            payload.orderId,
            Number(payload.refundAmount) || undefined,
            payload.reason,
            { name: instance.requesterName || instance.requester },
            instance.id,
          )
          return `已发起强制退款 ¥${Number(r.refundAmount).toFixed(2)}`
        }
        case 'PURCHASE_ORDER': {
          await this.prisma.purchaseOrder.update({
            where: { id: instance.bizId },
            data: { status: 'APPROVED' },
          })
          return '采购单已通过，转待收货'
        }
        case 'EXPENSE_ENTRY': {
          await this.prisma.expenseEntry.update({
            where: { id: instance.bizId },
            data: { status: 'EFFECTIVE' },
          })
          return '支出已生效，计入当月看板'
        }
        case 'STOCK_ADJUST': {
          await this.prisma.$transaction((tx) => this.stockService.applyAdjust(tx, instance.bizId))
          return '库存调整已生效'
        }
        default:
          return '未知单据类型，未执行'
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.logger.error(`审批 ${instance.id} 执行失败：${msg}`)
      return `审批已通过，但执行失败：${msg}`
    }
  }

  /** 驳回/撤销时把业务单据同步置为终态，避免单子一直挂在「审批中」 */
  private async writeBackBiz(instance: InstanceRow, result: 'REJECTED' | 'CANCELLED') {
    if (!instance.bizId) return
    try {
      switch (instance.bizType) {
        case 'PURCHASE_ORDER':
          await this.prisma.purchaseOrder.update({
            where: { id: instance.bizId },
            data: { status: result === 'REJECTED' ? 'REJECTED' : 'CANCELLED' },
          })
          break
        case 'EXPENSE_ENTRY':
          await this.prisma.expenseEntry.update({
            where: { id: instance.bizId },
            data: { status: 'REJECTED' },
          })
          break
        case 'STOCK_ADJUST':
          await this.prisma.stockAdjust.update({
            where: { id: instance.bizId },
            data: { status: result === 'REJECTED' ? 'REJECTED' : 'CANCELLED' },
          })
          break
        default:
          break
      }
    } catch (e) {
      this.logger.error(`审批 ${instance.id} 回写业务单失败：${(e as Error).message}`)
    }
  }

  // ===== 内部工具 =====

  private async resolveRequester(adminId?: string) {
    if (!adminId) return { username: '', name: '系统', orgId: null as string | null }
    const row = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
      select: { username: true, name: true, orgId: true },
    })
    if (!row) return { username: '', name: '系统', orgId: null as string | null }
    return row
  }

  private async orgTypeOf(orgId: string | null) {
    if (!orgId) return null
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { type: true },
    })
    return org?.type ?? null
  }

  private toDto(row: InstanceRow) {
    return {
      id: row.id,
      bizType: row.bizType,
      bizId: row.bizId,
      summary: row.summary,
      amount: Number(row.amount),
      orgId: row.orgId,
      requester: row.requester,
      requesterName: row.requesterName,
      flowId: row.flowId,
      flowName: row.flowName,
      currentIndex: row.currentIndex,
      status: row.status,
      resultNote: row.resultNote,
      finishedAt: row.finishedAt,
      createdAt: row.createdAt,
      nodes: row.nodes.map((node) => ({
        id: node.id,
        name: node.name,
        mode: node.mode,
        approvers: toStringArray(node.approvers),
        status: node.status,
        decisions: node.decisions.map((d) => ({
          approver: d.approver,
          approverName: d.approverName,
          action: d.action,
          comment: d.comment,
          createdAt: d.createdAt,
        })),
      })),
    }
  }
}
