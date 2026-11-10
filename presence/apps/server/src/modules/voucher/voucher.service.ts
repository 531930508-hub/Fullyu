import { Injectable } from '@nestjs/common'
import { randomInt } from 'node:crypto'
import { PrismaService } from '../../common/prisma.service'
import { RedisService } from '../../common/redis.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { ApprovalService } from '../approval/approval.service'
import {
  VOUCHER_CODE_ALPHABET,
  VOUCHER_CODE_LENGTH,
  normalizeVoucherCode,
  isValidVoucherCode,
} from '@fullyu/shared'

/** 兑换尝试限流：同一用户 60 秒内最多 10 次（含失败尝试） */
const REDEEM_RATE_LIMIT = 10
const REDEEM_RATE_WINDOW_SECONDS = 60
/** 单批最多发券张数 */
const BATCH_MAX_QUANTITY = 500

@Injectable()
export class VoucherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalService: ApprovalService,
    private readonly redis: RedisService,
  ) {}

  /** 后台代金券列表（可按用户/状态/批次过滤；UNCLAIMED=未兑换的兑换码券） */
  async adminList(query: { userId?: string; status?: string; batchNo?: string }) {
    const where: any = {}
    if (query.userId) where.userId = query.userId
    if (query.batchNo) where.batchNo = query.batchNo
    if (query.status === 'UNCLAIMED') {
      where.userId = null
      where.status = 'UNUSED'
    } else if (query.status) {
      where.status = query.status
    }
    return this.prisma.voucher.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { phone: true, nickname: true } } },
    })
  }

  /** 我的可用代金券（小程序端；未兑换的码券 userId 为空，天然不在其中） */
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

  /**
   * 兑换码批量发券：一次生成 N 张券，每张带唯一兑换密码，未兑换前不归属任何用户。
   * 与指定用户发放共用审批快照通道（VOUCHER_GRANT）；审批通过后码券同样生效。
   */
  async grantBatch(
    data: {
      quantity: number
      mode?: 'REDUCE_BY' | 'REDUCE_TO'
      amount?: number
      targetPrice?: number
      expiresAt: string
      source?: string
      applicableAll?: boolean
      applicableCourseIds?: string[]
    },
    requesterId?: string,
  ) {
    const quantity = Number(data.quantity)
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > BATCH_MAX_QUANTITY) {
      throw new BusinessException(`发放数量须为 1-${BATCH_MAX_QUANTITY} 的整数`, 4066)
    }
    if (!data.expiresAt) throw new BusinessException('请选择有效期', 4063)
    const expiresAt = new Date(data.expiresAt)
    if (!Number.isFinite(expiresAt.getTime())) {
      throw new BusinessException('有效期格式不正确', 4067)
    }
    if (expiresAt.getTime() <= Date.now()) {
      throw new BusinessException('有效期须晚于当前时间', 4068)
    }

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

    const batchNo = await this.generateBatchNo()
    const codes = await this.generateCodes(quantity)
    const applicableCourseIds = Array.from(new Set(data.applicableCourseIds ?? []))
    const rows = codes.map((redeemCode) => ({
      userId: null,
      redeemCode,
      batchNo,
      mode,
      amount: mode === 'REDUCE_BY' ? Number(data.amount) : 0,
      targetPrice: mode === 'REDUCE_TO' ? Number(data.targetPrice) : null,
      expiresAt,
      source: data.source?.trim() || '兑换码发券',
      applicableAll: data.applicableAll ?? false,
      applicableCourseIds,
      status: 'UNUSED' as const,
    }))

    const summary =
      mode === 'REDUCE_BY'
        ? `批量发券（兑换码）：减 ${Number(data.amount)} 元 × ${quantity} 张`
        : `批量发券（兑换码）：减至 ${Number(data.targetPrice)} 元 × ${quantity} 张`
    const faceValue = mode === 'REDUCE_BY' ? Number(data.amount) * quantity : 0
    const approval = await this.approvalService.submit({
      bizType: 'VOUCHER_GRANT',
      summary,
      amount: faceValue,
      payload: { rows, count: quantity, batchNo },
      requesterId: requesterId ?? undefined,
    })
    if (approval) {
      return { pendingApproval: true, approvalId: approval.id, granted: 0, batchNo }
    }

    const result = await this.prisma.voucher.createMany({ data: rows as any })
    return { batchNo, granted: result.count, codes }
  }

  /**
   * 兑换代金券：
   * - 输入归一化（大小写/分隔符/易混字符 O→0、I/L→1）后校验格式；
   * - 同一用户 60 秒内最多尝试 10 次，防暴力猜码；
   * - 数据库条件更新原子抢占，并发只可能成功一人；同人重复兑换幂等返回原券。
   */
  async redeem(userId: string, rawCode: unknown) {
    if (!userId) throw new BusinessException('请先登录', 4010)
    await this.checkRedeemRateLimit(userId)
    const code = normalizeVoucherCode(rawCode)
    if (!isValidVoucherCode(code)) {
      throw new BusinessException('兑换码格式不正确，请检查后重试', 4073)
    }

    const claim = async () => {
      const voucher = await this.prisma.voucher.findUnique({ where: { redeemCode: code } })
      if (!voucher) throw new BusinessException('兑换码不存在，请核对后重试', 4074)
      if (voucher.status === 'REVOKED') throw new BusinessException('该兑换码已作废', 4075)
      if (voucher.userId) {
        if (voucher.userId === userId) return { replayed: true, voucher }
        throw new BusinessException('该兑换码已被兑换', 4076)
      }
      if (voucher.status !== 'UNUSED') throw new BusinessException('该兑换码不可用', 4076)
      if (voucher.expiresAt.getTime() <= Date.now()) {
        throw new BusinessException('该兑换码已过期', 4077)
      }
      const result = await this.prisma.voucher.updateMany({
        where: { id: voucher.id, userId: null, status: 'UNUSED' },
        data: { userId, redeemedAt: new Date() },
      })
      if (result.count === 0) {
        // 并发窗口内被他人抢占（或自己刚刚成功）：以数据库最终状态为准
        const current = await this.prisma.voucher.findUnique({ where: { id: voucher.id } })
        if (current?.userId === userId) return { replayed: true, voucher: current }
        throw new BusinessException('该兑换码已被兑换', 4076)
      }
      const claimed = await this.prisma.voucher.findUnique({ where: { id: voucher.id } })
      return { replayed: false, voucher: claimed }
    }

    try {
      return await this.redis.withLock(`voucher-redeem:${code}`, claim, {
        ttlSeconds: 10,
        retries: 10,
        retryDelayMs: 80,
      })
    } catch (e) {
      if (e instanceof BusinessException) throw e
      // Redis 不可用时降级直跑：条件更新本身保证原子性，不会重复兑换
      return claim()
    }
  }

  /** 兑换码批次列表（后台）：按批次聚合兑换进度 */
  async batches() {
    const rows = await this.prisma.voucher.findMany({
      where: { batchNo: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: {
        batchNo: true,
        userId: true,
        status: true,
        mode: true,
        amount: true,
        targetPrice: true,
        expiresAt: true,
        source: true,
        applicableAll: true,
        createdAt: true,
      },
    })
    const map = new Map<string, any>()
    for (const v of rows) {
      const key = v.batchNo!
      let batch = map.get(key)
      if (!batch) {
        batch = {
          batchNo: key,
          total: 0,
          redeemed: 0,
          used: 0,
          revoked: 0,
          mode: v.mode,
          amount: v.amount,
          targetPrice: v.targetPrice,
          expiresAt: v.expiresAt,
          source: v.source,
          applicableAll: v.applicableAll,
          createdAt: v.createdAt,
        }
        map.set(key, batch)
      }
      batch.total += 1
      if (v.userId) batch.redeemed += 1
      if (v.status === 'USED') batch.used += 1
      if (v.status === 'REVOKED') batch.revoked += 1
    }
    return Array.from(map.values())
  }

  /** 批次明细：每张券的兑换码、状态与持券人 */
  async batchDetail(batchNo: string) {
    if (!batchNo) throw new BusinessException('缺少批次号', 4078)
    const rows = await this.prisma.voucher.findMany({
      where: { batchNo },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, phone: true, nickname: true } } },
    })
    if (!rows.length) throw new BusinessException('批次不存在', 4079)
    const summary = {
      total: rows.length,
      redeemed: rows.filter((r) => r.userId).length,
      used: rows.filter((r) => r.status === 'USED').length,
      revoked: rows.filter((r) => r.status === 'REVOKED').length,
    }
    return { batchNo, rows, summary }
  }

  /** 作废代金券（未兑换的码券同样可作废） */
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

  // ===== 内部工具 =====

  /** 限流计数；Redis 不可用时放行（兑换安全由数据库原子抢占兜底） */
  private async checkRedeemRateLimit(userId: string) {
    const key = `voucher-redeem:attempts:${userId}`
    try {
      const attempts = await this.redis.incr(key)
      if (attempts === 1) await this.redis.expire(key, REDEEM_RATE_WINDOW_SECONDS)
      if (attempts > REDEEM_RATE_LIMIT) {
        throw new BusinessException('兑换尝试过于频繁，请 1 分钟后再试', 4072)
      }
    } catch (e) {
      if (e instanceof BusinessException) throw e
      // 连接类错误静默降级
    }
  }

  private randomCode(): string {
    let code = ''
    for (let i = 0; i < VOUCHER_CODE_LENGTH; i++) {
      code += VOUCHER_CODE_ALPHABET[randomInt(VOUCHER_CODE_ALPHABET.length)]
    }
    return code
  }

  /** 生成 quantity 个全局唯一兑换码（字母表不含 I/L/O，避免手抄歧义） */
  private async generateCodes(quantity: number): Promise<string[]> {
    const codes: string[] = []
    const seen = new Set<string>()
    for (let round = 0; round < 5 && codes.length < quantity; round++) {
      const candidates: string[] = []
      while (candidates.length < quantity - codes.length) {
        const candidate = this.randomCode()
        if (seen.has(candidate)) continue
        seen.add(candidate)
        candidates.push(candidate)
      }
      const existing = await this.prisma.voucher.findMany({
        where: { redeemCode: { in: candidates } },
        select: { redeemCode: true },
      })
      const taken = new Set(existing.map((v) => v.redeemCode))
      codes.push(...candidates.filter((c) => !taken.has(c)))
    }
    if (codes.length < quantity) {
      throw new BusinessException('兑换码生成冲突，请重试', 4071)
    }
    return codes
  }

  /** 批次号：VB + 日期 + 6 位随机码，便于后台检索与导出 */
  private async generateBatchNo(): Promise<string> {
    const now = new Date()
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    for (let attempt = 0; attempt < 10; attempt++) {
      let suffix = ''
      for (let i = 0; i < 6; i++) {
        suffix += VOUCHER_CODE_ALPHABET[randomInt(VOUCHER_CODE_ALPHABET.length)]
      }
      const batchNo = `VB${date}-${suffix}`
      const exists = await this.prisma.voucher.findFirst({
        where: { batchNo },
        select: { id: true },
      })
      if (!exists) return batchNo
    }
    throw new BusinessException('批次号生成冲突，请重试', 4070)
  }
}
