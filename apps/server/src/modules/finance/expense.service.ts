import { Injectable } from '@nestjs/common'
import { ExpenseCategory, ExpenseStatus, Prisma } from '@prisma/client'
import { EXPENSE_CATEGORY_NAMES, isValidMonth } from '@fullyu/shared'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { buildOrgScope } from '../../common/utils/data-scope.util'
import type { AdminContext } from '../auth/admin-jwt.strategy'
import { ApprovalService } from '../approval/approval.service'

export interface ExpenseInput {
  orgId: string
  month: string
  category: ExpenseCategory
  /** 其他支出必填，用来说明具体是什么费用 */
  name?: string
  amount: number
  remark?: string
}

/**
 * 支出台账。
 *
 * 房租/人力/美团/其他这几类由人工录入或导入；
 * 管理费、培训费按组织比例现算，耗材成本从采购单汇总 —— 这两类不进本表，避免重复记账。
 * 录入即挂审批，未命中流程时直接生效，不会把单子卡住。
 */
@Injectable()
export class ExpenseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalService: ApprovalService,
  ) {}

  async list(
    admin: AdminContext,
    query: {
      month?: string
      orgId?: string
      category?: ExpenseCategory
      status?: ExpenseStatus
    } = {},
  ) {
    const scope = await buildOrgScope(this.prisma, admin)
    const where: Prisma.ExpenseEntryWhereInput = { ...scope.toWhere('orgId') }
    if (query.month) where.month = query.month
    if (query.orgId) {
      scope.assertWritable(query.orgId)
      where.orgId = query.orgId
    }
    if (query.category) where.category = query.category
    if (query.status) where.status = query.status
    const rows = await this.prisma.expenseEntry.findMany({
      where,
      orderBy: [{ month: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    })
    const orgs = await this.prisma.organization.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.orgId))] } },
      select: { id: true, shortName: true },
    })
    const orgMap = new Map(orgs.map((o) => [o.id, o.shortName]))
    return rows.map((row) => this.toDto(row, orgMap.get(row.orgId)))
  }

  async create(admin: AdminContext, input: ExpenseInput) {
    const org = await this.assertInput(admin, input)
    const operator = await this.operatorOf(admin)
    const amount = Math.round((Number(input.amount) || 0) * 100) / 100
    if (amount <= 0) throw new BusinessException('支出金额必须大于 0', 4281)

    const created = await this.prisma.expenseEntry.create({
      data: {
        orgId: input.orgId,
        month: input.month,
        category: input.category,
        name: input.name?.trim() ?? '',
        amount,
        source: 'MANUAL',
        remark: input.remark ?? '',
        status: 'PENDING_APPROVAL',
        createdBy: operator.username,
        createdByName: operator.name,
      },
    })

    const label = input.name?.trim() || EXPENSE_CATEGORY_NAMES[input.category]
    const approval = await this.approvalService.submit({
      bizType: 'EXPENSE_ENTRY',
      bizId: created.id,
      summary: `${org.shortName} ${input.month} ${label} ¥${amount.toFixed(2)}`,
      amount,
      orgId: input.orgId,
      requesterId: admin.adminId,
    })

    const row = await this.prisma.expenseEntry.update({
      where: { id: created.id },
      // 未命中流程即免审，直接生效计入当月看板
      data: approval
        ? { approvalId: approval.id, flowName: approval.flowName }
        : { status: 'EFFECTIVE', flowName: '' },
    })
    return this.toDto(row, org.shortName)
  }

  /** 已生效的支出不允许改数，避免看板已出的数字被悄悄改掉；驳回后可改再提 */
  async update(admin: AdminContext, id: string, input: ExpenseInput) {
    const current = await this.prisma.expenseEntry.findUnique({ where: { id } })
    if (!current) throw new BusinessException('支出记录不存在', 4280)
    if (current.status === 'PENDING_APPROVAL') {
      throw new BusinessException('审批中的支出请先撤销审批再修改', 4282)
    }
    const org = await this.assertInput(admin, input)
    const amount = Math.round((Number(input.amount) || 0) * 100) / 100
    if (amount <= 0) throw new BusinessException('支出金额必须大于 0', 4281)

    const row = await this.prisma.expenseEntry.update({
      where: { id },
      data: {
        orgId: input.orgId,
        month: input.month,
        category: input.category,
        name: input.name?.trim() ?? '',
        amount,
        remark: input.remark ?? '',
      },
    })
    return this.toDto(row, org.shortName)
  }

  async remove(admin: AdminContext, id: string) {
    const current = await this.prisma.expenseEntry.findUnique({ where: { id } })
    if (!current) throw new BusinessException('支出记录不存在', 4280)
    const scope = await buildOrgScope(this.prisma, admin)
    scope.assertWritable(current.orgId)
    if (current.status === 'PENDING_APPROVAL') {
      throw new BusinessException('审批中的支出请先撤销审批', 4282)
    }
    await this.prisma.expenseEntry.delete({ where: { id } })
    return { id }
  }

  /**
   * 批量导入。
   * 导入量通常是整月一批，逐条挂审批会淹没审批人的待办，因此导入的直接生效，
   * 权限上用 finance:expense:import 单独管控。
   */
  async importBatch(admin: AdminContext, inputs: ExpenseInput[]) {
    const rows = (inputs ?? []).filter((it) => it && it.orgId && it.month)
    if (!rows.length) throw new BusinessException('没有可导入的支出数据', 4283)
    const scope = await buildOrgScope(this.prisma, admin)
    for (const row of rows) {
      if (!isValidMonth(row.month)) throw new BusinessException(`月份 ${row.month} 格式应为 yyyy-MM`, 4270)
      scope.assertWritable(row.orgId)
    }
    const orgIds = [...new Set(rows.map((r) => r.orgId))]
    const orgs = await this.prisma.organization.findMany({ where: { id: { in: orgIds } } })
    if (orgs.length !== orgIds.length) throw new BusinessException('存在无效的门店组织', 4275)
    const operator = await this.operatorOf(admin)

    const result = await this.prisma.expenseEntry.createMany({
      data: rows.map((row) => ({
        orgId: row.orgId,
        month: row.month,
        category: row.category ?? 'OTHER',
        name: row.name?.trim() ?? '',
        amount: Math.round((Number(row.amount) || 0) * 100) / 100,
        source: 'IMPORT' as const,
        remark: row.remark ?? '',
        status: 'EFFECTIVE' as const,
        createdBy: operator.username,
        createdByName: operator.name,
      })),
    })
    return { created: result.count }
  }

  private async assertInput(admin: AdminContext, input: ExpenseInput) {
    if (!isValidMonth(input.month)) throw new BusinessException('月份格式应为 yyyy-MM', 4270)
    if (input.category === 'OTHER' && !input.name?.trim()) {
      throw new BusinessException('其他支出请填写费用名称', 4284)
    }
    const scope = await buildOrgScope(this.prisma, admin)
    scope.assertWritable(input.orgId)
    const org = await this.prisma.organization.findUnique({ where: { id: input.orgId } })
    if (!org) throw new BusinessException('门店组织不存在', 4275)
    return org
  }

  private async operatorOf(admin: AdminContext) {
    const row = await this.prisma.adminUser.findUnique({
      where: { id: admin.adminId },
      select: { username: true, name: true },
    })
    return { username: row?.username ?? admin.username, name: row?.name ?? '' }
  }

  private toDto(row: Prisma.ExpenseEntryGetPayload<object>, orgName?: string) {
    return {
      id: row.id,
      orgId: row.orgId,
      orgName: orgName ?? row.orgId,
      month: row.month,
      category: row.category,
      name: row.name || EXPENSE_CATEGORY_NAMES[row.category],
      amount: Number(row.amount),
      source: row.source,
      remark: row.remark,
      status: row.status,
      approvalId: row.approvalId,
      flowName: row.flowName,
      createdBy: row.createdBy,
      createdByName: row.createdByName,
      createdAt: row.createdAt,
    }
  }
}
