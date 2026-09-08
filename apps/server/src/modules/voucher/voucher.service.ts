import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { ApprovalService } from '../approval/approval.service'

@Injectable()
export class VoucherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalService: ApprovalService,
  ) {}

  /** 后台代金券列表（可按用户/状态过滤） */
  async adminList(query: { userId?: string; status?: string }) {
    const where: any = {}
    if (query.userId) where.userId = query.userId
    if (query.status) where.status = query.status
    return this.prisma.voucher.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { phone: true, nickname: true } } },
    })
  }

  /** 我的可用代金券（小程序端） */
  async myVouchers(userId: string, onlyUsable = false) {
    const where: any = { userId }
    if (onlyUsable) {
      where.status = 'UNUSED'
      where.expiresAt = { gt: new Date() }
    }
    return this.prisma.voucher.findMany({ where, orderBy: { createdAt: 'desc' } })
  }

  /**
   * 发放代金券：可向多个用户批量发放。
   * 支持两种模式：REDUCE_BY 减额（amount）/ REDUCE_TO 减至（targetPrice）。
   * 若已配置审批人，则创建二次审批单（不立即发放）；否则直接发放。
   */
  async grant(
    data: {
      userIds: string[]
      mode?: 'REDUCE_BY' | 'REDUCE_TO'
      amount?: number
      targetPrice?: number
      expiresAt: string
      source: string
      applicableAll?: boolean
      applicableCourseIds?: string[]
    },
    requesterId?: string,
  ) {
    if (!data.userIds?.length) throw new BusinessException('请选择发放用户', 4060)
    if (!data.expiresAt) throw new BusinessException('请选择有效期', 4063)

    const mode = data.mode === 'REDUCE_TO' ? 'REDUCE_TO' : 'REDUCE_BY'
    if (mode === 'REDUCE_BY') {
      if (!data.amount || Number(data.amount) <= 0) {
        throw new BusinessException('请填写正确的抵扣面额', 4064)
      }
    } else {
      if (data.targetPrice === undefined || data.targetPrice === null || Number(data.targetPrice) < 0) {
        throw new BusinessException('请填写正确的减至目标价', 4065)
      }
    }

    const applicableCourseIds = Array.from(new Set(data.applicableCourseIds ?? []))
    const rows = data.userIds.map((userId) => ({
      userId,
      mode,
      amount: mode === 'REDUCE_BY' ? Number(data.amount) : 0,
      targetPrice: mode === 'REDUCE_TO' ? Number(data.targetPrice) : null,
      expiresAt: new Date(data.expiresAt),
      source: data.source,
      applicableAll: data.applicableAll ?? false,
      applicableCourseIds,
      status: 'UNUSED' as const,
    }))

    // 审批接入：命中流程则挂审批，通过后由引擎按 payload 快照落券；未命中直接发放
    const summary =
      mode === 'REDUCE_BY'
        ? `发放代金券：减 ${Number(data.amount)} 元 × ${rows.length} 人`
        : `发放代金券：减至 ${Number(data.targetPrice)} 元 × ${rows.length} 人`
    const faceValue = mode === 'REDUCE_BY' ? Number(data.amount) * rows.length : 0
    const approval = await this.approvalService.submit({
      bizType: 'VOUCHER_GRANT',
      summary,
      amount: faceValue,
      payload: { rows, count: rows.length },
      requesterId: requesterId ?? undefined,
    })
    if (approval) {
      return { pendingApproval: true, approvalId: approval.id, granted: 0 }
    }

    const result = await this.prisma.voucher.createMany({ data: rows as any })
    return { granted: result.count }
  }

  /** 作废代金券 */
  async revoke(id: string) {
    const voucher = await this.prisma.voucher.findUnique({ where: { id } })
    if (!voucher) throw new BusinessException('代金券不存在', 4061)
    if (voucher.status === 'USED') {
      throw new BusinessException('已使用的代金券不可作废', 4062)
    }
    return this.prisma.voucher.update({
      where: { id },
      data: { status: 'REVOKED' },
    })
  }
}
