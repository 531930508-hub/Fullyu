import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import {
  parseHHmm,
  type TimeDiscountActionType,
  type TimeDiscountFixedPrice,
  type TimeDiscountRange,
} from '@fullyu/shared'

export interface TimeDiscountInput {
  name: string
  orgIds?: string[]
  weekdays?: number[]
  timeRanges?: TimeDiscountRange[]
  validFrom?: string | null
  validTo?: string | null
  actionType: TimeDiscountActionType
  discountPercent?: number | null
  fixedPrices?: TimeDiscountFixedPrice[] | null
  remark?: string | null
}

@Injectable()
export class TimeDiscountService {
  constructor(private readonly prisma: PrismaService) {}

  /** 后台列表：全量按优先级升序（过滤在前端做，保持全局排序视图） */
  async adminList() {
    return this.prisma.memberTimeDiscountRule.findMany({
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    })
  }

  async create(input: TimeDiscountInput) {
    this.validate(input)
    const max = await this.prisma.memberTimeDiscountRule.aggregate({ _max: { priority: true } })
    return this.prisma.memberTimeDiscountRule.create({
      data: {
        ...this.toData(input),
        priority: (max._max.priority ?? -1) + 1,
      },
    })
  }

  async update(id: string, input: TimeDiscountInput) {
    this.validate(input)
    const exist = await this.prisma.memberTimeDiscountRule.findUnique({ where: { id } })
    if (!exist) throw new BusinessException('时段折扣规则不存在', 4040)
    return this.prisma.memberTimeDiscountRule.update({ where: { id }, data: this.toData(input) })
  }

  async setStatus(id: string, status: 'ENABLED' | 'DISABLED') {
    const exist = await this.prisma.memberTimeDiscountRule.findUnique({ where: { id } })
    if (!exist) throw new BusinessException('时段折扣规则不存在', 4040)
    return this.prisma.memberTimeDiscountRule.update({ where: { id }, data: { status } })
  }

  /** 调序：传入完整 id 顺序，重排 priority = 下标 */
  async reorder(ids: string[]) {
    if (!Array.isArray(ids) || ids.length === 0) throw new BusinessException('参数错误', 4000)
    const total = await this.prisma.memberTimeDiscountRule.count()
    if (ids.length !== total) throw new BusinessException('排序需包含全部规则，请刷新后重试', 4000)
    await this.prisma.$transaction(
      ids.map((id, i) =>
        this.prisma.memberTimeDiscountRule.update({ where: { id }, data: { priority: i } }),
      ),
    )
    return { success: true }
  }

  async remove(id: string) {
    const exist = await this.prisma.memberTimeDiscountRule.findUnique({ where: { id } })
    if (!exist) throw new BusinessException('时段折扣规则不存在', 4040)
    const used = await this.prisma.order.count({ where: { hitTimeRuleId: id } })
    if (used > 0) throw new BusinessException('该规则已被订单引用，不可删除，请改为停用', 4000)
    await this.prisma.memberTimeDiscountRule.delete({ where: { id } })
    return { success: true }
  }

  private toData(input: TimeDiscountInput) {
    // Prisma Json 字段要求 InputJsonValue；可空 Json 的 SQL NULL 须用 DbNull 而非 null
    const json = (v: unknown) => v as Prisma.InputJsonValue
    return {
      name: input.name.trim(),
      orgIds: json(input.orgIds ?? []),
      weekdays: json(input.weekdays ?? []),
      timeRanges: json(input.timeRanges ?? []),
      validFrom: input.validFrom ? new Date(input.validFrom) : null,
      validTo: input.validTo ? new Date(input.validTo) : null,
      actionType: input.actionType,
      discountPercent: input.actionType === 'PERCENT' ? input.discountPercent ?? null : null,
      fixedPrices:
        input.actionType === 'FIXED_BY_DURATION' && input.fixedPrices
          ? json(input.fixedPrices)
          : Prisma.DbNull,
      remark: input.remark ?? null,
    }
  }

  private validate(input: TimeDiscountInput) {
    if (!input.name?.trim()) throw new BusinessException('规则名称不能为空', 4000)
    const weekdays = input.weekdays ?? []
    if (weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) {
      throw new BusinessException('星期取值须为 1-7', 4000)
    }
    for (const r of input.timeRanges ?? []) {
      const s = parseHHmm(r.start)
      const e = parseHHmm(r.end)
      if (s == null || e == null) throw new BusinessException('时间段格式须为 HH:mm', 4000)
      if (s >= e) throw new BusinessException('时间段开始须早于结束（不支持跨午夜）', 4000)
    }
    if (input.validFrom && input.validTo && new Date(input.validFrom) > new Date(input.validTo)) {
      throw new BusinessException('日期范围开始不能晚于结束', 4000)
    }
    if (input.actionType === 'PERCENT') {
      const p = input.discountPercent
      if (p == null || !Number.isFinite(p) || p < 50 || p > 200) {
        throw new BusinessException('折扣率须在 50–200 之间', 4000)
      }
    } else if (input.actionType === 'FIXED_BY_DURATION') {
      const fps = input.fixedPrices ?? []
      if (fps.length === 0) throw new BusinessException('按时长固定价至少需要一条价目', 4000)
      const seen = new Set<number>()
      for (const fp of fps) {
        if (!Number.isInteger(fp.minutes) || fp.minutes <= 0) {
          throw new BusinessException('时长（分钟）须为正整数', 4000)
        }
        if (seen.has(fp.minutes)) throw new BusinessException(`时长 ${fp.minutes} 分钟重复`, 4000)
        seen.add(fp.minutes)
        if (fp.price == null || !Number.isFinite(fp.price) || fp.price < 0) {
          throw new BusinessException('固定价须为非负数', 4000)
        }
      }
    } else {
      throw new BusinessException('未知的折扣动作类型', 4000)
    }
  }
}
