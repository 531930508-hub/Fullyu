import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'

@Injectable()
export class VoucherService {
  constructor(private readonly prisma: PrismaService) {}

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
   * 发放代金券：可向多个用户批量发放
   */
  async grant(data: {
    userIds: string[]
    amount: number
    expiresAt: string
    source: string
    applicableAll?: boolean
    applicableCourseIds?: string[]
  }) {
    if (!data.userIds?.length) throw new BusinessException('请选择发放用户', 4060)
    const rows = data.userIds.map((userId) => ({
      userId,
      amount: data.amount,
      expiresAt: new Date(data.expiresAt),
      source: data.source,
      applicableAll: data.applicableAll ?? false,
      applicableCourseIds: data.applicableCourseIds ?? [],
      status: 'UNUSED' as const,
    }))
    const result = await this.prisma.voucher.createMany({ data: rows })
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
