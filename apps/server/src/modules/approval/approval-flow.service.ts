import { Injectable } from '@nestjs/common'
import { ApprovalBizType, ApprovalFlowScope, ApprovalNodeMode, Prisma } from '@prisma/client'
import { pickFlowRule, type FlowRuleLike } from '@fullyu/shared'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'

/** 节点入参：审批人存登录名（手机号） */
export interface FlowNodeInput {
  name: string
  mode: ApprovalNodeMode
  approvers: string[]
}

export interface UpsertFlowRuleInput {
  bizType: ApprovalBizType
  name: string
  scope?: ApprovalFlowScope
  minAmount?: number | null
  maxAmount?: number | null
  enabled?: boolean
  remark?: string
  sortOrder?: number
  nodes: FlowNodeInput[]
}

/** 出参：节点的 approvers 从 Json 拆成字符串数组，金额转 number */
export interface FlowRuleDto {
  id: string
  bizType: ApprovalBizType
  name: string
  scope: ApprovalFlowScope
  minAmount: number | null
  maxAmount: number | null
  enabled: boolean
  remark: string
  sortOrder: number
  nodes: { id: string; name: string; mode: ApprovalNodeMode; approvers: string[] }[]
}

/**
 * 审批流程配置。
 *
 * 一份规则 = 单据类型 + 组织范围 + 金额区间 + 有序节点。
 * 命中判定复用 shared 的 pickFlowRule，保证配置页预览与后端落库结果一致。
 */
@Injectable()
export class ApprovalFlowService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: { bizType?: ApprovalBizType; enabled?: boolean } = {}): Promise<FlowRuleDto[]> {
    const where: Prisma.ApprovalFlowRuleWhereInput = {}
    if (query.bizType) where.bizType = query.bizType
    if (query.enabled !== undefined) where.enabled = query.enabled
    const rows = await this.prisma.approvalFlowRule.findMany({
      where,
      orderBy: [{ bizType: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { nodes: { orderBy: { sortOrder: 'asc' } } },
    })
    return rows.map((row) => this.toDto(row))
  }

  async detail(id: string): Promise<FlowRuleDto> {
    const row = await this.prisma.approvalFlowRule.findUnique({
      where: { id },
      include: { nodes: { orderBy: { sortOrder: 'asc' } } },
    })
    if (!row) throw new BusinessException('流程不存在', 4200)
    return this.toDto(row)
  }

  async create(input: UpsertFlowRuleInput): Promise<FlowRuleDto> {
    const nodes = this.normalizeNodes(input.nodes)
    this.assertAmountRange(input.minAmount, input.maxAmount)
    const row = await this.prisma.approvalFlowRule.create({
      data: {
        bizType: input.bizType,
        name: input.name.trim(),
        scope: input.scope ?? 'ALL',
        minAmount: input.minAmount ?? null,
        maxAmount: input.maxAmount ?? null,
        enabled: input.enabled ?? true,
        remark: input.remark ?? '',
        sortOrder: input.sortOrder ?? 0,
        nodes: { create: nodes },
      },
      include: { nodes: { orderBy: { sortOrder: 'asc' } } },
    })
    return this.toDto(row)
  }

  /**
   * 整单覆盖：节点先删后建。
   * 在跑的审批实例用的是自己那份节点拷贝，所以这里改动不会影响进行中的单。
   */
  async update(id: string, input: UpsertFlowRuleInput): Promise<FlowRuleDto> {
    await this.detail(id)
    const nodes = this.normalizeNodes(input.nodes)
    this.assertAmountRange(input.minAmount, input.maxAmount)
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.approvalFlowNode.deleteMany({ where: { ruleId: id } })
      return tx.approvalFlowRule.update({
        where: { id },
        data: {
          bizType: input.bizType,
          name: input.name.trim(),
          scope: input.scope ?? 'ALL',
          minAmount: input.minAmount ?? null,
          maxAmount: input.maxAmount ?? null,
          enabled: input.enabled ?? true,
          remark: input.remark ?? '',
          sortOrder: input.sortOrder ?? 0,
          nodes: { create: nodes },
        },
        include: { nodes: { orderBy: { sortOrder: 'asc' } } },
      })
    })
    return this.toDto(row)
  }

  async toggle(id: string, enabled: boolean): Promise<FlowRuleDto> {
    await this.detail(id)
    const row = await this.prisma.approvalFlowRule.update({
      where: { id },
      data: { enabled },
      include: { nodes: { orderBy: { sortOrder: 'asc' } } },
    })
    return this.toDto(row)
  }

  async remove(id: string) {
    await this.detail(id)
    const running = await this.prisma.approvalInstance.count({
      where: { flowId: id, status: 'PENDING' },
    })
    if (running > 0) {
      throw new BusinessException(`该流程还有 ${running} 单在审批中，请先处理完再删除`, 4201)
    }
    await this.prisma.approvalFlowRule.delete({ where: { id } })
    return { success: true }
  }

  /**
   * 命中预览：按单据类型 + 金额 + 组织范围试算会走哪条流程。
   * 返回 null 表示免审直通，配置页要明确提示，别让人误以为是漏配。
   */
  async preview(input: {
    bizType: ApprovalBizType
    amount: number
    scope: 'HQ' | 'STORE'
  }): Promise<FlowRuleDto | null> {
    const rules = await this.matchable(input.bizType)
    const hit = pickFlowRule(rules as (FlowRuleLike & FlowRuleDto)[], input.bizType, input.amount, input.scope)
    return hit ?? null
  }

  /** 供引擎取候选规则：只取启用的，按 sortOrder 排好，第一条命中即用 */
  async matchable(bizType: ApprovalBizType): Promise<FlowRuleDto[]> {
    const rows = await this.prisma.approvalFlowRule.findMany({
      where: { bizType, enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { nodes: { orderBy: { sortOrder: 'asc' } } },
    })
    return rows.map((row) => this.toDto(row))
  }

  // ===== 内部工具 =====

  private assertAmountRange(min?: number | null, max?: number | null) {
    if (min !== null && min !== undefined && max !== null && max !== undefined && min >= max) {
      throw new BusinessException('金额下限须小于上限', 4202)
    }
  }

  /** 节点必须有名字和至少一个审批人，否则单据提交后会永远卡在这一步 */
  private normalizeNodes(nodes: FlowNodeInput[]) {
    const list = nodes ?? []
    if (!list.length) throw new BusinessException('至少配置一个审批节点', 4203)
    return list.map((node, index) => {
      const approvers = (node.approvers ?? []).map((a) => String(a).trim()).filter(Boolean)
      if (!node.name?.trim()) throw new BusinessException(`第 ${index + 1} 个节点缺少名称`, 4204)
      if (!approvers.length) {
        throw new BusinessException(`节点「${node.name}」未选审批人，会导致单据无人可批`, 4205)
      }
      return {
        name: node.name.trim(),
        mode: node.mode ?? 'ANY',
        approvers: [...new Set(approvers)] as Prisma.InputJsonValue,
        sortOrder: index,
      }
    })
  }

  private toDto(
    row: Prisma.ApprovalFlowRuleGetPayload<{ include: { nodes: true } }>,
  ): FlowRuleDto {
    return {
      id: row.id,
      bizType: row.bizType,
      name: row.name,
      scope: row.scope,
      minAmount: row.minAmount === null ? null : Number(row.minAmount),
      maxAmount: row.maxAmount === null ? null : Number(row.maxAmount),
      enabled: row.enabled,
      remark: row.remark,
      sortOrder: row.sortOrder,
      nodes: row.nodes.map((node) => ({
        id: node.id,
        name: node.name,
        mode: node.mode,
        approvers: toStringArray(node.approvers),
      })),
    }
  }
}

/** 节点审批人存的是 Json，取用前统一收敛成字符串数组 */
export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((v) => String(v)).filter(Boolean)
}
