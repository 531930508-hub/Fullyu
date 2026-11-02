import { Injectable } from '@nestjs/common';
import type { Coupon, CustomerCoupon } from '@prisma/client';
import { badRequest, notFound } from '../common/errors';
import { newId } from '../common/ids';
import { logAction } from '../common/logs';
import { PrismaService } from '../common/prisma.service';
import type { StaffContext } from '../common/auth.types';

export type CouponTemplateInput = {
  title: string;
  scope: 'all' | 'category';
  categoryId?: string | null;
  amountCents: number;
  minSpendCents: number;
  validFrom: string;
  validTo: string;
  note?: string;
};

/** 券模板对外视图（后台）：含已发放 / 已使用统计。 */
const mapTemplate = (row: Coupon, stats?: { issued: number; used: number; available: number }) => ({
  id: row.id,
  title: row.title,
  scope: row.scope,
  categoryId: row.categoryId,
  amountCents: row.amountCents,
  minSpendCents: row.minSpendCents,
  validFrom: row.validFrom.getTime(),
  validTo: row.validTo.getTime(),
  active: row.active,
  note: row.note,
  createdBy: row.createdBy,
  createdAt: row.createdAt.getTime(),
  ...(stats || {})
});

/** 顾客持券视图：把库内状态与有效期合并成顾客能看懂的状态。 */
const mapCustomerCoupon = (row: CustomerCoupon & { coupon: Coupon }, now = Date.now()) => {
  const coupon = row.coupon;
  const status =
    row.status === 'used'
      ? 'used'
      : row.status === 'reserved'
        ? 'reserved'
        : !coupon.active
          ? 'inactive'
          : coupon.validTo.getTime() < now
            ? 'expired'
            : coupon.validFrom.getTime() > now
              ? 'pending'
              : 'available';
  return {
    id: row.id,
    title: coupon.title,
    scope: coupon.scope,
    categoryId: coupon.categoryId,
    amountCents: coupon.amountCents,
    minSpendCents: coupon.minSpendCents,
    validFrom: coupon.validFrom.getTime(),
    validTo: coupon.validTo.getTime(),
    note: coupon.note,
    status,
    issuedAt: row.issuedAt.getTime(),
    usedAt: row.usedAt ? row.usedAt.getTime() : null
  };
};

export type ResolvedCoupon = {
  id: string;
  templateId: string;
  title: string;
  discountCents: number;
};

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async listTemplates() {
    const rows = await this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
    const grouped = await this.prisma.customerCoupon.groupBy({
      by: ['couponId', 'status'],
      _count: { _all: true }
    });
    return rows.map((row) => {
      const stats = { issued: 0, used: 0, available: 0 };
      for (const group of grouped) {
        if (group.couponId !== row.id) continue;
        stats.issued += group._count._all;
        if (group.status === 'used') stats.used += group._count._all;
        if (group.status === 'available') stats.available += group._count._all;
      }
      return mapTemplate(row, stats);
    });
  }

  async createTemplate(input: CouponTemplateInput, actor: StaffContext) {
    const range = parseRange(input.validFrom, input.validTo);
    if (!input.title.trim()) throw badRequest('请填写券名称');
    if (input.amountCents <= 0) throw badRequest('券面额必须大于 0');
    if (input.minSpendCents < 0) throw badRequest('使用门槛不能为负数');
    if (input.scope === 'category' && !input.categoryId) throw badRequest('指定品类券需要选择分类');
    if (input.scope === 'category') {
      const category = await this.prisma.category.findUnique({ where: { id: input.categoryId! } });
      if (!category) throw badRequest('分类不存在');
    }
    const row = await this.prisma.coupon.create({
      data: {
        id: newId('CP'),
        title: input.title.trim().slice(0, 40),
        scope: input.scope,
        categoryId: input.scope === 'category' ? input.categoryId! : null,
        amountCents: Math.round(input.amountCents),
        minSpendCents: Math.round(input.minSpendCents),
        validFrom: range.from,
        validTo: range.to,
        active: true,
        note: String(input.note || '').slice(0, 200),
        createdBy: actor.id,
        createdAt: new Date()
      }
    });
    await logAction(this.prisma, {
      actorId: actor.id,
      actorName: actor.name,
      action: '创建优惠券',
      detail: `${row.title} · ¥${(row.amountCents / 100).toFixed(2)}`,
      type: 'coupon'
    });
    return mapTemplate(row, { issued: 0, used: 0, available: 0 });
  }

  async updateTemplate(id: string, input: { active?: boolean; note?: string }, actor: StaffContext) {
    const row = await this.prisma.coupon.findUnique({ where: { id } });
    if (!row) throw notFound('优惠券不存在');
    const updated = await this.prisma.coupon.update({
      where: { id },
      data: {
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.note !== undefined ? { note: String(input.note).slice(0, 200) } : {})
      }
    });
    await logAction(this.prisma, {
      actorId: actor.id,
      actorName: actor.name,
      action: input.active === undefined ? '更新优惠券' : input.active ? '启用优惠券' : '停用优惠券',
      detail: updated.title,
      type: 'coupon'
    });
    return mapTemplate(updated);
  }

  /**
   * 发券：手机号是会员唯一身份，按号码找顾客逐张发放。
   * 同一顾客对同一模板只保留一张未使用的券，避免重复发放导致叠加。
   */
  async issue(templateId: string, phones: string[], actor: StaffContext) {
    const template = await this.prisma.coupon.findUnique({ where: { id: templateId } });
    if (!template) throw notFound('优惠券不存在');
    if (!template.active) throw badRequest('优惠券已停用，不能发放');
    const normalized = Array.from(
      new Set(
        phones
          .map((phone) => String(phone || '').replace(/[\s-]/g, ''))
          .filter((phone) => {
            if (!/^1\d{10}$/.test(phone)) return false;
            return true;
          })
      )
    );
    if (!normalized.length) throw badRequest('请填写至少一个有效手机号');

    const customers = await this.prisma.customer.findMany({
      where: { phone: { in: normalized } },
      select: { id: true, phone: true }
    });
    const byPhone = new Map(customers.map((row) => [row.phone!, row.id]));
    const issued: Array<{ phone: string; couponId: string }> = [];
    const skipped: Array<{ phone: string; reason: string }> = [];
    const now = new Date();
    for (const phone of normalized) {
      const customerId = byPhone.get(phone);
      if (!customerId) {
        skipped.push({ phone, reason: '该手机号尚未注册会员' });
        continue;
      }
      const existing = await this.prisma.customerCoupon.findFirst({
        where: { couponId: templateId, customerId, status: { in: ['available', 'reserved'] } }
      });
      if (existing) {
        skipped.push({ phone, reason: '已有未使用的同款券' });
        continue;
      }
      const created = await this.prisma.customerCoupon.create({
        data: {
          id: newId('CC'),
          couponId: templateId,
          customerId,
          status: 'available',
          issuedAt: now
        }
      });
      issued.push({ phone, couponId: created.id });
    }
    await logAction(this.prisma, {
      actorId: actor.id,
      actorName: actor.name,
      action: '发放优惠券',
      detail: `${template.title} · 成功 ${issued.length} 张，跳过 ${skipped.length} 个号码`,
      type: 'coupon'
    });
    return { issued, skipped, template: mapTemplate(template) };
  }

  async listForCustomer(customerId: string) {
    const rows = await this.prisma.customerCoupon.findMany({
      where: { customerId },
      include: { coupon: true },
      orderBy: { issuedAt: 'desc' }
    });
    const now = Date.now();
    const mapped = rows.map((row) => mapCustomerCoupon(row, now));
    const rank: Record<string, number> = { available: 0, pending: 1, reserved: 2, used: 3, expired: 4, inactive: 5 };
    mapped.sort((a, b) => rank[a.status] - rank[b.status] || b.issuedAt - a.issuedAt);
    return {
      coupons: mapped,
      availableCount: mapped.filter((row) => row.status === 'available').length
    };
  }

  /**
   * 下单核验：归属、状态、有效期、品类范围与门槛全部由服务端判定。
   * 折扣只作用于券可用商品的实付小计，不触碰不可用商品。
   */
  async resolveForOrder(params: {
    customerId: string;
    couponId: string;
    lines: Array<{ categoryId: string; totalCents: number }>;
    retryOrderId?: string;
  }): Promise<ResolvedCoupon> {
    const row = await this.prisma.customerCoupon.findUnique({
      where: { id: params.couponId },
      include: { coupon: true }
    });
    if (!row || row.customerId !== params.customerId) throw badRequest('优惠券不存在或不属于当前会员');
    const retrying = Boolean(
      params.retryOrderId && row.status === 'reserved' && row.orderId === params.retryOrderId
    );
    if (row.status !== 'available' && !retrying) throw badRequest('优惠券不可用或已使用');
    const coupon = row.coupon;
    const now = Date.now();
    if (!coupon.active) throw badRequest('优惠券已停用');
    if (now < coupon.validFrom.getTime()) throw badRequest('优惠券尚未生效');
    if (now > coupon.validTo.getTime()) throw badRequest('优惠券已过期');
    const eligible = params.lines
      .filter((line) => coupon.scope === 'all' || line.categoryId === coupon.categoryId)
      .reduce((sum, line) => sum + line.totalCents, 0);
    if (!eligible) throw badRequest('本单没有可用此券的商品');
    if (eligible < coupon.minSpendCents) {
      throw badRequest(`本单可用金额未达到 ¥${(coupon.minSpendCents / 100).toFixed(2)} 的用券门槛`);
    }
    return {
      id: row.id,
      templateId: coupon.id,
      title: coupon.title,
      discountCents: Math.min(coupon.amountCents, eligible)
    };
  }
}

/** 有效期按中国时区自然日解析：开始日 00:00，结束日 23:59:59.999。 */
function parseRange(fromText: string, toText: string): { from: Date; to: Date } {
  const from = new Date(`${String(fromText).trim()}T00:00:00+08:00`);
  const to = new Date(`${String(toText).trim()}T23:59:59.999+08:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw badRequest('有效期格式不正确');
  if (from.getTime() >= to.getTime()) throw badRequest('有效期结束需晚于开始');
  return { from, to };
}
