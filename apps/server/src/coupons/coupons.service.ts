import { Injectable } from '@nestjs/common';
import type { Coupon, CouponBatch, CustomerCoupon, Prisma } from '@prisma/client';
import { badRequest, notFound } from '../common/errors';
import { newId } from '../common/ids';
import { logAction } from '../common/logs';
import { PrismaService } from '../common/prisma.service';
import type { StaffContext } from '../common/auth.types';

export type CouponTemplateInput = {
  title: string;
  scope: CouponScope;
  categoryId?: string | null;
  productId?: string | null;
  amountCents: number;
  minSpendCents: number;
  validFrom: string;
  validTo: string;
  /** 0=固定区间；>0=发放/领取后 N 天有效（且不晚于 validTo）。 */
  validDays?: number;
  claimable?: boolean;
  claimLimit?: number;
  note?: string;
};

export type CouponScope = 'all' | 'category' | 'product';

/** 单次按手机号发放的上限：更多人群请用会员条件筛选，避免一次提交过大。 */
const MAX_MANUAL_PHONES = 200;
/** 单次筛选发放的人数上限：超过则要求缩小条件分批发放，保证事务时间和可追溯性。 */
const MAX_SEGMENT_CUSTOMERS = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 系统自动发券的操作人：审计日志里能与人工操作区分。 */
const SYSTEM_ACTOR: StaffContext = {
  id: 'system',
  name: '系统自动发放',
  username: 'system',
  active: true,
  allStores: true,
  storeIds: [],
  roles: [],
  perms: new Set(['*']),
  tokenVersion: 0
};

export type CouponSegmentFilter = {
  /** 全部会员 / 普通会员 / 年卡会员 */
  tier: 'all' | 'standard' | 'annual';
  /** 按注册日期筛选（YYYY-MM-DD，含当天） */
  registeredFrom?: string;
  registeredTo?: string;
};

/** 发放目标：手机号批量 / 会员条件 / 全量（全量即 tier=all 且无日期条件）。 */
export type CouponIssueOptions = {
  /** 幂等键：同一次提交重复触发只产生一个批次；缺省时服务端生成。 */
  requestKey?: string;
  /** 批次备注，仅后台可见。 */
  note?: string;
};

export type CouponIssueResult = {
  batchId: string;
  /** true 表示命中幂等键、本次没有重复发放。 */
  replayed: boolean;
  requested: number;
  issuedCount: number;
  skippedCount: number;
  issued: Array<{ phone: string; couponId: string; customerId: string }>;
  skipped: Array<{ phone: string; reason: string }>;
  template: ReturnType<typeof mapTemplate>;
};

export type CouponRecordStatus =
  | 'available'
  | 'pending'
  | 'reserved'
  | 'used'
  | 'expired'
  | 'inactive'
  | 'revoked';

export type CouponRecordQuery = {
  couponId?: string;
  batchId?: string;
  status?: CouponRecordStatus;
  /** 手机号 / 会员姓名 / 会员编号 模糊搜索 */
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

/** 券模板对外视图（后台）：含已发放 / 已使用 / 已作废 / 自助领取统计。 */
const mapTemplate = (
  row: Coupon,
  stats?: { issued: number; used: number; available: number; revoked: number; claimed?: number }
) => ({
  id: row.id,
  title: row.title,
  scope: row.scope,
  categoryId: row.categoryId,
  productId: row.productId,
  amountCents: row.amountCents,
  minSpendCents: row.minSpendCents,
  validFrom: row.validFrom.getTime(),
  validTo: row.validTo.getTime(),
  validDays: row.validDays,
  claimable: row.claimable,
  claimLimit: row.claimLimit,
  active: row.active,
  note: row.note,
  createdBy: row.createdBy,
  createdAt: row.createdAt.getTime(),
  ...(stats || {})
});

/**
 * 单张券的实际可用区间：发放时刻起 N 天，与模板活动截止取较早；
 * 模板尚未开始时从开始时刻算起。写入实例后不再随模板改动。
 */
export function computeValidity(
  template: { validFrom: Date; validTo: Date; validDays: number },
  issuedAt: Date
): { validFrom: Date; validTo: Date } {
  const validFrom = new Date(Math.max(issuedAt.getTime(), template.validFrom.getTime()));
  const endByDays =
    template.validDays > 0 ? issuedAt.getTime() + template.validDays * DAY_MS : Number.POSITIVE_INFINITY;
  const validTo = new Date(Math.min(endByDays, template.validTo.getTime()));
  return { validFrom, validTo };
}

/** 顾客持券视图：把库内状态与这张券自己的有效期合并成顾客能看懂的状态。 */
const mapCustomerCoupon = (
  row: CustomerCoupon & { coupon: Coupon },
  now = Date.now(),
  productName = ''
) => {
  const coupon = row.coupon;
  const status =
    row.status === 'used'
      ? 'used'
      : row.status === 'reserved'
        ? 'reserved'
        : row.status === 'revoked'
          ? 'revoked'
          : !coupon.active
            ? 'inactive'
            : row.validTo.getTime() < now
              ? 'expired'
              : row.validFrom.getTime() > now
                ? 'pending'
                : 'available';
  return {
    id: row.id,
    templateId: coupon.id,
    title: coupon.title,
    scope: coupon.scope,
    categoryId: coupon.categoryId,
    productId: coupon.productId,
    productName: productName || null,
    amountCents: coupon.amountCents,
    minSpendCents: coupon.minSpendCents,
    validFrom: row.validFrom.getTime(),
    validTo: row.validTo.getTime(),
    note: coupon.note,
    status,
    issuedAt: row.issuedAt.getTime(),
    usedAt: row.usedAt ? row.usedAt.getTime() : null,
    revokedAt: row.revokedAt ? row.revokedAt.getTime() : null,
    revokeReason: row.revokeReason || '',
    source: row.ruleId ? 'auto' : 'manual'
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
    const [grouped, claimedGroups] = await Promise.all([
      this.prisma.customerCoupon.groupBy({
        by: ['couponId', 'status'],
        _count: { _all: true }
      }),
      // 自助领取张数：以领取批次（source=claim）的成功发放数统计。
      this.prisma.couponBatch.groupBy({
        by: ['couponId'],
        where: { source: 'claim' },
        _sum: { issued: true }
      })
    ]);
    const claimedOf = new Map(claimedGroups.map((row) => [row.couponId, row._sum.issued || 0]));
    return rows.map((row) => {
      const stats = { issued: 0, used: 0, available: 0, revoked: 0, claimed: claimedOf.get(row.id) || 0 };
      for (const group of grouped) {
        if (group.couponId !== row.id) continue;
        stats.issued += group._count._all;
        if (group.status === 'used') stats.used += group._count._all;
        if (group.status === 'available') stats.available += group._count._all;
        if (group.status === 'revoked') stats.revoked += group._count._all;
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
    if (input.scope === 'product' && !input.productId) throw badRequest('指定单品券需要选择商品');
    if (input.scope === 'category') {
      const category = await this.prisma.category.findUnique({ where: { id: input.categoryId! } });
      if (!category) throw badRequest('分类不存在');
    }
    if (input.scope === 'product') {
      const product = await this.prisma.product.findUnique({ where: { id: input.productId! } });
      if (!product) throw badRequest('商品不存在');
    }
    // 有效期：固定区间必须还有未来可用的时段；按天有效期 1~365 天。
    if (range.to.getTime() <= Date.now()) throw badRequest('活动结束日期需晚于当前时间');
    const validDays = Math.round(Number(input.validDays || 0));
    if (!Number.isFinite(validDays) || validDays < 0 || validDays > 365) {
      throw badRequest('发放后有效天数需在 0~365 之间');
    }
    const claimable = Boolean(input.claimable);
    const claimLimit = Math.round(Number(input.claimLimit ?? 1));
    if (claimable && (claimLimit < 1 || claimLimit > 99)) throw badRequest('每人领取上限需在 1~99 之间');
    const row = await this.prisma.coupon.create({
      data: {
        id: newId('CP'),
        title: input.title.trim().slice(0, 40),
        scope: input.scope,
        categoryId: input.scope === 'category' ? input.categoryId! : null,
        productId: input.scope === 'product' ? input.productId! : null,
        amountCents: Math.round(input.amountCents),
        minSpendCents: Math.round(input.minSpendCents),
        validFrom: range.from,
        validTo: range.to,
        validDays,
        claimable,
        claimLimit: claimable ? claimLimit : 1,
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
      detail: `${row.title} · ¥${(row.amountCents / 100).toFixed(2)}${validDays ? ` · 发放后 ${validDays} 天有效` : ''}`,
      type: 'coupon'
    });
    return mapTemplate(row, { issued: 0, used: 0, available: 0, revoked: 0, claimed: 0 });
  }

  async updateTemplate(
    id: string,
    input: { active?: boolean; note?: string; claimable?: boolean; claimLimit?: number },
    actor: StaffContext
  ) {
    const row = await this.prisma.coupon.findUnique({ where: { id } });
    if (!row) throw notFound('优惠券不存在');
    if (input.claimLimit !== undefined && (input.claimLimit < 1 || input.claimLimit > 99)) {
      throw badRequest('每人领取上限需在 1~99 之间');
    }
    const updated = await this.prisma.coupon.update({
      where: { id },
      data: {
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.note !== undefined ? { note: String(input.note).slice(0, 200) } : {}),
        ...(input.claimable !== undefined ? { claimable: input.claimable } : {}),
        ...(input.claimLimit !== undefined ? { claimLimit: input.claimLimit } : {})
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
   * 发券：手机号是会员唯一身份，按号码找顾客发放。
   * 同一顾客对同一模板只保留一张未使用的券，避免重复发放叠加。
   * 每次发放都会落一条批次（coupon_batches），发券记录与撤回都以批次为线索。
   */
  async issue(
    templateId: string,
    phones: string[],
    actor: StaffContext,
    options: CouponIssueOptions = {}
  ): Promise<CouponIssueResult> {
    const template = await this.getIssuableTemplate(templateId);
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
    if (normalized.length > MAX_MANUAL_PHONES) {
      throw badRequest(`单次最多发放 ${MAX_MANUAL_PHONES} 个手机号，请分批发放或改用会员条件筛选`);
    }

    const customers = await this.prisma.customer.findMany({
      where: { phone: { in: normalized } },
      select: { id: true, phone: true }
    });
    const byPhone = new Map(customers.filter((row) => row.phone).map((row) => [row.phone as string, row.id]));
    const targets: IssueTarget[] = [];
    const skipped: Array<{ phone: string; reason: string }> = [];
    for (const phone of normalized) {
      const customerId = byPhone.get(phone);
      if (!customerId) skipped.push({ phone, reason: '该手机号尚未注册会员' });
      else targets.push({ customerId, phone });
    }

    return this.dispatch({
      template,
      targets,
      skipped,
      requested: normalized.length,
      source: 'manual',
      // 不把手机号写进快照：号码明细在发券记录里可查，避免敏感信息二次留存。
      filter: { source: 'manual', phones: normalized.length },
      options,
      actor
    });
  }

  /** 按会员条件发放：等级 + 注册日期；全量发放即 tier=all 且不带日期。 */
  async issueSegment(
    templateId: string,
    filter: CouponSegmentFilter,
    actor: StaffContext,
    options: CouponIssueOptions = {}
  ): Promise<CouponIssueResult> {
    const template = await this.getIssuableTemplate(templateId);
    const customers = await this.prisma.customer.findMany({
      where: this.segmentWhere(filter),
      select: { id: true, phone: true },
      orderBy: { createdAt: 'asc' },
      take: MAX_SEGMENT_CUSTOMERS + 1
    });
    if (!customers.length) throw badRequest('当前条件下没有可发放的会员');
    if (customers.length > MAX_SEGMENT_CUSTOMERS) {
      throw badRequest(`单次最多发放 ${MAX_SEGMENT_CUSTOMERS} 人，请缩小筛选范围后分批发放`);
    }
    const targets = customers.map((row) => ({ customerId: row.id, phone: row.phone || '' }));
    const isAll = filter.tier === 'all' && !filter.registeredFrom && !filter.registeredTo;
    return this.dispatch({
      template,
      targets,
      skipped: [],
      requested: targets.length,
      source: isAll ? 'all' : 'segment',
      filter: {
        source: isAll ? 'all' : 'segment',
        tier: filter.tier,
        registeredFrom: filter.registeredFrom || null,
        registeredTo: filter.registeredTo || null
      },
      options,
      actor
    });
  }

  /** 自动规则发放入口：目标人群由规则引擎算好，发券事务与人工发放完全一致。 */
  async issueAutomated(params: {
    templateId: string;
    ruleId: string;
    ruleKind: string;
    /** 周期标记参与幂等与去重，例如生日年份 / once / 唤醒月份。 */
    periodOf: (customerId: string) => string;
    targets: Array<{ customerId: string; phone: string }>;
    requestKey: string;
    note?: string;
  }) {
    const template = await this.prisma.coupon.findUnique({ where: { id: params.templateId } });
    if (!template) throw notFound('优惠券不存在');
    if (!template.active) throw badRequest('优惠券已停用');
    if (template.validTo.getTime() < Date.now()) throw badRequest('优惠券已过期');
    if (!params.targets.length) {
      // 当天没有目标人群时不落批次，避免每天生成一批「0 成功」噪音。
      return { batchId: '', replayed: false, issuedCount: 0, skippedCount: 0, targetCount: 0 };
    }
    const result = await this.dispatch({
      template,
      targets: params.targets,
      skipped: [],
      requested: params.targets.length,
      source: 'auto',
      filter: {
        source: 'auto',
        ruleId: params.ruleId,
        kind: params.ruleKind,
        period: params.periodOf(params.targets[0].customerId)
      },
      options: { requestKey: params.requestKey, note: params.note || '' },
      actor: SYSTEM_ACTOR,
      rule: { id: params.ruleId, periodOf: params.periodOf }
    });
    return {
      batchId: result.batchId,
      replayed: result.replayed,
      issuedCount: result.issuedCount,
      skippedCount: result.skippedCount,
      targetCount: params.targets.length
    };
  }

  /**
   * 发前预览：命中人数、其中已有同款未使用券会被跳过的人数、将实际发出的人数。
   * 预览与正式发放共用同一套条件，避免「看到的数字」和「发出去的数字」不一致。
   */
  async previewSegment(templateId: string, filter: CouponSegmentFilter) {
    const template = await this.prisma.coupon.findUnique({ where: { id: templateId } });
    if (!template) throw notFound('优惠券不存在');
    const where = this.segmentWhere(filter);
    const [count, standard, annual, existing] = await this.prisma.$transaction([
      this.prisma.customer.count({ where }),
      this.prisma.customer.count({ where: { ...where, memberTier: 'standard' } }),
      this.prisma.customer.count({ where: { ...where, memberTier: 'annual' } }),
      this.prisma.customer.count({
        where: {
          ...where,
          coupons: { some: { couponId: templateId, status: { in: ['available', 'reserved'] } } }
        }
      })
    ]);
    return {
      count,
      standard,
      annual,
      existing,
      willIssue: Math.max(count - existing, 0),
      capped: count > MAX_SEGMENT_CUSTOMERS,
      max: MAX_SEGMENT_CUSTOMERS
    };
  }

  async getIssuableTemplate(templateId: string) {
    const template = await this.prisma.coupon.findUnique({ where: { id: templateId } });
    if (!template) throw notFound('优惠券不存在');
    if (!template.active) throw badRequest('优惠券已停用，不能发放');
    if (template.validTo.getTime() < Date.now()) throw badRequest('优惠券已过期，不能发放');
    return template;
  }

  /**
   * 统一发放事务：批次与券实例同时落库，任何一步失败都整体回滚。
   * 幂等键先在事务内查一次；并发下唯一索引兜底（P2002 → 视为重复提交，返回已有批次）。
   */
  private async dispatch(params: {
    template: Coupon;
    targets: IssueTarget[];
    skipped: Array<{ phone: string; reason: string }>;
    requested: number;
    source: string;
    filter: Record<string, unknown>;
    options: CouponIssueOptions;
    actor: StaffContext;
    /** 自动规则归因：按周期去重，同一规则同一周期同一会员只发一次。 */
    rule?: { id: string; periodOf: (customerId: string) => string };
  }): Promise<CouponIssueResult> {
    const { template, targets, skipped, requested, source, filter, options, actor, rule } = params;
    const requestKey = String(options.requestKey || '').trim().slice(0, 64) || newId('CK');
    const replay = async (batch: CouponBatch): Promise<CouponIssueResult> => ({
      batchId: batch.id,
      replayed: true,
      requested: batch.requested,
      issuedCount: batch.issued,
      skippedCount: batch.skipped,
      issued: [],
      skipped: [],
      template: mapTemplate(template)
    });

    const existing = await this.prisma.couponBatch.findUnique({ where: { requestKey } });
    if (existing) return replay(existing);

    const batchId = newId('CB');
    const now = new Date();
    const customerIds = targets.map((target) => target.customerId);
    let outcome: {
      batch: CouponBatch;
      created: Array<{ customerId: string; phone: string; couponId: string }>;
      held: string[];
      alreadyThisPeriod: string[];
      replayed: boolean;
    };
    const validity = computeValidity(template, now);
    try {
      outcome = await this.prisma.$transaction(
        async (tx) => {
          const duplicate = await tx.couponBatch.findUnique({ where: { requestKey } });
          if (duplicate) {
            return { batch: duplicate, created: [], held: [], alreadyThisPeriod: [], replayed: true };
          }
          // 事务内再查一次，缩小并发窗口：同一顾客只保留一张未使用的同款券。
          const held = await tx.customerCoupon.findMany({
            where: {
              couponId: template.id,
              customerId: { in: customerIds },
              status: { in: ['available', 'reserved'] }
            },
            select: { customerId: true }
          });
          const heldSet = new Set(held.map((row) => row.customerId));
          const periods = new Map(targets.map((target) => [target.customerId, rule?.periodOf(target.customerId) || '']));
          // 自动规则按周期去重：同一规则同一周期不再重复发。
          let issuedThisPeriod = new Set<string>();
          if (rule) {
            const exist = await tx.customerCoupon.findMany({
              where: {
                ruleId: rule.id,
                customerId: { in: customerIds },
                rulePeriod: { in: Array.from(new Set(Array.from(periods.values()))) }
              },
              select: { customerId: true, rulePeriod: true }
            });
            issuedThisPeriod = new Set(exist.map((row) => row.customerId));
          }
          const fresh = targets.filter(
            (target) => !heldSet.has(target.customerId) && !issuedThisPeriod.has(target.customerId)
          );
          // 会员快照：发券那一刻的等级、入会时间与累计已支付单数。
          const snapshot = await this.customerSnapshot(
            tx,
            fresh.map((target) => target.customerId)
          );
          const batch = await tx.couponBatch.create({
            data: {
              id: batchId,
              couponId: template.id,
              source,
              requested,
              issued: fresh.length,
              skipped: requested - fresh.length,
              filter: JSON.stringify(filter),
              requestKey,
              note: String(options.note || '').trim().slice(0, 100),
              operatorId: actor.id,
              operatorName: actor.name,
              createdAt: now
            }
          });
          const created: Array<{ customerId: string; phone: string; couponId: string }> = [];
          for (const target of fresh) {
            const member = snapshot.get(target.customerId);
            const row = await tx.customerCoupon.create({
              data: {
                id: newId('CC'),
                couponId: template.id,
                customerId: target.customerId,
                batchId,
                status: 'available',
                issuedAt: now,
                validFrom: validity.validFrom,
                validTo: validity.validTo,
                memberTier: member?.tier || '',
                memberSince: member?.since || null,
                orderCount: member?.orderCount || 0,
                ruleId: rule ? rule.id : null,
                rulePeriod: rule ? periods.get(target.customerId) || '' : ''
              }
            });
            created.push({ customerId: target.customerId, phone: target.phone, couponId: row.id });
          }
          return {
            batch,
            created,
            held: held.map((row) => row.customerId),
            alreadyThisPeriod: Array.from(issuedThisPeriod),
            replayed: false
          };
        },
        { timeout: 30000 }
      );
    } catch (error) {
      // 并发重复提交：唯一索引拒绝第二个批次，直接返回先落库的批次。
      if ((error as { code?: string }).code === 'P2002') {
        const batch = await this.prisma.couponBatch.findUnique({ where: { requestKey } });
        if (batch) return replay(batch);
      }
      throw error;
    }

    if (outcome.replayed) return replay(outcome.batch);

    // 事务内发现的「已有未使用券 / 本周期已发」按手机号补进跳过明细；顺序与原提交无关但计数一致。
    const phoneOf = new Map(targets.map((target) => [target.customerId, target.phone]));
    const periodSet = new Set(outcome.alreadyThisPeriod);
    // 同一个人可能同时命中多个跳过原因，明细按手机号去重，计数与 batch.skipped 保持一致。
    const seenPhones = new Set<string>();
    const skippedAll = [
      ...skipped,
      ...outcome.held.map((customerId) => ({
        phone: phoneOf.get(customerId) || '',
        reason: '已有未使用的同款券'
      })),
      ...Array.from(periodSet).map((customerId) => ({
        phone: phoneOf.get(customerId) || '',
        reason: '本周期已自动发放'
      }))
    ].filter((row) => {
      if (!row.phone) return true;
      if (seenPhones.has(row.phone)) return false;
      seenPhones.add(row.phone);
      return true;
    });

    await logAction(this.prisma, {
      actorId: actor.id,
      actorName: actor.name,
      action: source === 'auto' ? '自动发放优惠券' : source === 'claim' ? '顾客自助领取优惠券' : '发放优惠券',
      detail: `${template.title} · 批次 ${batchId} · 成功 ${outcome.created.length} 张，跳过 ${skippedAll.length} 人`,
      type: 'coupon'
    });

    return {
      batchId,
      replayed: false,
      requested,
      issuedCount: outcome.created.length,
      skippedCount: skippedAll.length,
      issued: outcome.created,
      skipped: skippedAll,
      template: mapTemplate(template)
    };
  }

  /** 发券时的会员快照：等级、入会时间、累计已支付单数；查询失败不阻断发券。 */
  private async customerSnapshot(tx: Prisma.TransactionClient, customerIds: string[]) {
    const map = new Map<string, { tier: string; since: Date | null; orderCount: number }>();
    if (!customerIds.length) return map;
    const customers = await tx.customer.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, memberTier: true, createdAt: true }
    });
    const counts = await tx.order.groupBy({
      by: ['customerId'],
      where: { customerId: { in: customerIds }, paidAt: { not: null } },
      _count: { _all: true }
    });
    const countOf = new Map(counts.map((row) => [row.customerId, row._count._all]));
    for (const customer of customers) {
      map.set(customer.id, {
        tier: customer.memberTier || '',
        since: customer.createdAt,
        orderCount: countOf.get(customer.id) || 0
      });
    }
    return map;
  }

  /** 发券记录：分页 + 条件筛选；汇总数字跟随「除状态外」的筛选，便于核对。 */
  async listRecords(query: CouponRecordQuery = {}) {
    const now = new Date();
    const page = Math.max(1, Math.floor(query.page || 1));
    const pageSize = Math.min(200, Math.max(10, Math.floor(query.pageSize || 20)));
    const base = this.recordBaseWhere(query);
    const statusWhere = this.recordStatusWhere(query.status, now);
    const where: Prisma.CustomerCouponWhereInput = statusWhere ? { AND: [base, statusWhere] } : base;

    const [rows, total, grouped, usable, pending, expired, inactive] = await Promise.all([
      this.prisma.customerCoupon.findMany({
        where,
        include: {
          coupon: {
            select: {
              id: true,
              title: true,
              amountCents: true,
              minSpendCents: true,
              scope: true,
              categoryId: true,
              productId: true,
              active: true,
              validFrom: true,
              validTo: true
            }
          },
          customer: { select: { id: true, name: true, memberCode: true, phone: true } },
          batch: { select: { id: true, source: true, operatorName: true, createdAt: true, note: true } }
        },
        orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.customerCoupon.count({ where }),
      this.prisma.customerCoupon.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      this.prisma.customerCoupon.count({ where: { AND: [base, this.recordStatusWhere('available', now)!] } }),
      this.prisma.customerCoupon.count({ where: { AND: [base, this.recordStatusWhere('pending', now)!] } }),
      this.prisma.customerCoupon.count({ where: { AND: [base, this.recordStatusWhere('expired', now)!] } }),
      this.prisma.customerCoupon.count({ where: { AND: [base, this.recordStatusWhere('inactive', now)!] } })
    ]);

    const raw: Record<string, number> = {};
    for (const group of grouped) raw[group.status] = group._count._all;

    return {
      records: rows.map((row) => ({
        id: row.id,
        couponId: row.couponId,
        couponTitle: row.coupon.title,
        amountCents: row.coupon.amountCents,
        minSpendCents: row.coupon.minSpendCents,
        scope: row.coupon.scope,
        categoryId: row.coupon.categoryId,
        productId: row.coupon.productId,
        status: this.effectiveStatus(row.status, row, row.coupon.active, now),
        issuedAt: row.issuedAt.getTime(),
        validFrom: row.validFrom.getTime(),
        validTo: row.validTo.getTime(),
        usedAt: row.usedAt ? row.usedAt.getTime() : null,
        revokedAt: row.revokedAt ? row.revokedAt.getTime() : null,
        revokeReason: row.revokeReason,
        orderId: row.orderId,
        // 发券时的会员快照；历史数据是迁移时按当时值补的。
        memberTier: row.memberTier,
        memberSince: row.memberSince ? row.memberSince.getTime() : null,
        orderCount: row.orderCount,
        autoRuleId: row.ruleId,
        batch: row.batch
          ? {
              id: row.batch.id,
              source: row.batch.source,
              operatorName: row.batch.operatorName,
              createdAt: row.batch.createdAt.getTime(),
              note: row.batch.note
            }
          : null,
        customer: {
          id: row.customer.id,
          name: row.customer.name,
          memberCode: row.customer.memberCode,
          // 后台属业务端：号码脱敏展示，完整号码只在 CRM 权威库可见。
          phone: maskPhone(row.customer.phone)
        }
      })),
      page,
      pageSize,
      total,
      summary: {
        total: Object.values(raw).reduce((sum, value) => sum + value, 0),
        used: raw.used || 0,
        reserved: raw.reserved || 0,
        revoked: raw.revoked || 0,
        available: usable,
        pending,
        expired,
        inactive
      }
    };
  }

  /** 发券批次：后台审计视角，含每批已用 / 可作废张数与操作人。 */
  async listBatches(params: { couponId?: string; limit?: number } = {}) {
    const limit = Math.min(200, Math.max(1, Math.floor(params.limit || 50)));
    const rows = await this.prisma.couponBatch.findMany({
      where: params.couponId ? { couponId: params.couponId } : {},
      include: {
        coupon: { select: { title: true, amountCents: true, active: true, validTo: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
    const ids = rows.map((row) => row.id);
    const grouped = ids.length
      ? await this.prisma.customerCoupon.groupBy({
          by: ['batchId', 'status'],
          where: { batchId: { in: ids } },
          _count: { _all: true }
        })
      : [];
    return {
      batches: rows.map((row) => {
        const stats = { available: 0, reserved: 0, used: 0, revoked: 0 };
        for (const group of grouped) {
          if (group.batchId !== row.id) continue;
          if (group.status in stats) stats[group.status as keyof typeof stats] += group._count._all;
        }
        return {
          id: row.id,
          couponId: row.couponId,
          couponTitle: row.coupon.title,
          amountCents: row.coupon.amountCents,
          couponActive: row.coupon.active,
          couponValidTo: row.coupon.validTo.getTime(),
          source: row.source,
          requested: row.requested,
          issued: row.issued,
          skipped: row.skipped,
          filter: parseFilterSnapshot(row.filter),
          note: row.note,
          operatorId: row.operatorId,
          operatorName: row.operatorName,
          createdAt: row.createdAt.getTime(),
          stats,
          canRevoke: stats.available > 0
        };
      })
    };
  }

  /** 单张作废：只允许未使用（available）的券；已锁单、已使用、已作废都不能再动。 */
  async revoke(recordId: string, reason: string, actor: StaffContext) {
    const trimmed = String(reason || '').trim();
    if (trimmed.length < 2) throw badRequest('请填写作废原因（至少 2 个字）');
    const row = await this.prisma.customerCoupon.findUnique({
      where: { id: recordId },
      include: { coupon: { select: { title: true } } }
    });
    if (!row) throw notFound('发券记录不存在');
    const result = await this.prisma.customerCoupon.updateMany({
      where: { id: row.id, status: 'available' },
      data: {
        status: 'revoked',
        revokedAt: new Date(),
        revokeReason: trimmed.slice(0, 200),
        revokedBy: actor.name
      }
    });
    if (!result.count) throw badRequest('只有未使用的券可以作废');
    await logAction(this.prisma, {
      actorId: actor.id,
      actorName: actor.name,
      action: '作废优惠券',
      detail: `${row.coupon.title} · ${row.id} · ${trimmed.slice(0, 60)}`,
      type: 'coupon'
    });
    return { id: row.id, status: 'revoked' as const };
  }

  /** 批次作废：只回收该批次里仍未使用的券，已用/在途订单一律不动。 */
  async revokeBatch(batchId: string, reason: string, actor: StaffContext) {
    const trimmed = String(reason || '').trim();
    if (trimmed.length < 2) throw badRequest('请填写作废原因（至少 2 个字）');
    const batch = await this.prisma.couponBatch.findUnique({
      where: { id: batchId },
      include: { coupon: { select: { title: true } } }
    });
    if (!batch) throw notFound('发券批次不存在');
    const result = await this.prisma.customerCoupon.updateMany({
      where: { batchId, status: 'available' },
      data: {
        status: 'revoked',
        revokedAt: new Date(),
        revokeReason: trimmed.slice(0, 200),
        revokedBy: actor.name
      }
    });
    if (!result.count) throw badRequest('该批次没有可作废的未使用券');
    await logAction(this.prisma, {
      actorId: actor.id,
      actorName: actor.name,
      action: '作废发券批次',
      detail: `${batch.coupon.title} · ${batch.id} · 作废 ${result.count} 张 · ${trimmed.slice(0, 60)}`,
      type: 'coupon'
    });
    return { batchId, revoked: result.count };
  }

  /** 会员条件 → Prisma where；条件与预览、发放共用，保证数字一致。 */
  private segmentWhere(filter: CouponSegmentFilter): Prisma.CustomerWhereInput {
    const where: Prisma.CustomerWhereInput = { phone: { not: null } };
    if (filter.tier === 'standard' || filter.tier === 'annual') where.memberTier = filter.tier;
    const from = filter.registeredFrom ? dayStart(filter.registeredFrom) : null;
    const to = filter.registeredTo ? dayEnd(filter.registeredTo) : null;
    if (from && to && from.getTime() > to.getTime()) throw badRequest('注册开始日期需早于结束日期');
    if (from || to) {
      where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    }
    return where;
  }

  /** 记录筛选（不含状态）：券、批次、发放时间与手机号/会员关键词。 */
  private recordBaseWhere(query: CouponRecordQuery): Prisma.CustomerCouponWhereInput {
    const and: Prisma.CustomerCouponWhereInput[] = [];
    if (query.couponId) and.push({ couponId: query.couponId });
    if (query.batchId) and.push({ batchId: query.batchId });
    const from = query.from ? dayStart(query.from) : null;
    const to = query.to ? dayEnd(query.to) : null;
    if (from && to && from.getTime() > to.getTime()) throw badRequest('开始日期需早于结束日期');
    if (from || to) {
      and.push({ issuedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });
    }
    const keyword = String(query.q || '').trim();
    if (keyword) {
      and.push({
        customer: {
          OR: [
            { phone: { contains: keyword } },
            { name: { contains: keyword } },
            { memberCode: { contains: keyword } }
          ]
        }
      });
    }
    return and.length ? { AND: and } : {};
  }

  /** 顾客看到的派生状态 → 数据库条件；每张券的有效期以实例上的 validFrom/validTo 为准。 */
  private recordStatusWhere(
    status: CouponRecordStatus | undefined,
    now: Date
  ): Prisma.CustomerCouponWhereInput | null {
    switch (status) {
      case undefined:
        return null;
      case 'available':
        return {
          status: 'available',
          coupon: { active: true },
          validFrom: { lte: now },
          validTo: { gte: now }
        };
      case 'pending':
        return { status: 'available', coupon: { active: true }, validFrom: { gt: now } };
      case 'expired':
        return { status: 'available', coupon: { active: true }, validTo: { lt: now } };
      case 'inactive':
        return { status: 'available', coupon: { active: false } };
      default:
        return { status };
    }
  }

  private effectiveStatus(
    status: string,
    row: { validFrom: Date; validTo: Date },
    couponActive: boolean,
    now: Date
  ): CouponRecordStatus {
    if (status === 'used' || status === 'reserved' || status === 'revoked') return status;
    if (!couponActive) return 'inactive';
    if (row.validTo.getTime() < now.getTime()) return 'expired';
    if (row.validFrom.getTime() > now.getTime()) return 'pending';
    return 'available';
  }

  async listForCustomer(customerId: string) {
    const rows = await this.prisma.customerCoupon.findMany({
      where: { customerId },
      include: { coupon: true },
      orderBy: { issuedAt: 'desc' }
    });
    const now = Date.now();
    const productNames = await this.productNames(rows.map((row) => row.coupon.productId));
    const mapped = rows.map((row) =>
      mapCustomerCoupon(row, now, row.coupon.productId ? productNames.get(row.coupon.productId) || '' : '')
    );
    const rank: Record<string, number> = {
      available: 0,
      pending: 1,
      reserved: 2,
      used: 3,
      revoked: 4,
      expired: 5,
      inactive: 6
    };
    mapped.sort((a, b) => rank[a.status] - rank[b.status] || b.issuedAt - a.issuedAt);
    return {
      coupons: mapped,
      availableCount: mapped.filter((row) => row.status === 'available').length
    };
  }

  /** 可自助领取的券：只返回活动期内、开放领取且未达上限/未持同款的模板。 */
  async listClaimable(customerId: string) {
    const now = new Date();
    const templates = await this.prisma.coupon.findMany({
      where: { claimable: true, active: true, validFrom: { lte: now }, validTo: { gte: now } },
      orderBy: [{ createdAt: 'desc' }]
    });
    if (!templates.length) return { templates: [] };
    const ids = templates.map((row) => row.id);
    const [claimedRows, heldRows, productNames] = await Promise.all([
      this.prisma.customerCoupon.groupBy({
        by: ['couponId'],
        where: { customerId, couponId: { in: ids } },
        _count: { _all: true }
      }),
      this.prisma.customerCoupon.findMany({
        where: { customerId, couponId: { in: ids }, status: { in: ['available', 'reserved'] } },
        select: { couponId: true }
      }),
      this.productNames(templates.map((row) => row.productId))
    ]);
    const claimedOf = new Map(claimedRows.map((row) => [row.couponId, row._count._all]));
    const holding = new Set(heldRows.map((row) => row.couponId));
    return {
      templates: templates.map((row) => {
        const claimed = claimedOf.get(row.id) || 0;
        const remain = Math.max(row.claimLimit - claimed, 0);
        const hasUnused = holding.has(row.id);
        return {
          id: row.id,
          title: row.title,
          scope: row.scope,
          categoryId: row.categoryId,
          productId: row.productId,
          productName: row.productId ? productNames.get(row.productId) || null : null,
          amountCents: row.amountCents,
          minSpendCents: row.minSpendCents,
          validFrom: row.validFrom.getTime(),
          validTo: row.validTo.getTime(),
          validDays: row.validDays,
          claimLimit: row.claimLimit,
          claimed,
          remain,
          canClaim: remain > 0 && !hasUnused,
          reason: hasUnused ? '你已有一张未使用的同款券' : remain > 0 ? '' : '已达到领取上限'
        };
      })
    };
  }

  /**
   * 自助领取：沿用发券批次与实例同一套事务，领取也是一次可追溯的「发放」。
   * 同一模板同时只能持有一张未使用券，累计不超过 claimLimit 张（用完后可再领）。
   */
  async claim(templateId: string, customer: { id: string; name: string; phone: string | null }) {
    const template = await this.prisma.coupon.findUnique({ where: { id: templateId } });
    if (!template) throw notFound('优惠券不存在');
    if (!template.active) throw badRequest('优惠券已停用');
    if (!template.claimable) throw badRequest('该券不支持自助领取');
    const now = new Date();
    if (now.getTime() < template.validFrom.getTime()) throw badRequest('活动尚未开始');
    if (now.getTime() > template.validTo.getTime()) throw badRequest('活动已结束');
    const existing = await this.prisma.customerCoupon.findMany({
      where: { customerId: customer.id, couponId: templateId },
      select: { status: true }
    });
    if (existing.length >= template.claimLimit) throw badRequest('已达到领取上限');
    if (existing.some((row) => row.status === 'available' || row.status === 'reserved')) {
      throw badRequest('你已有一张未使用的同款券');
    }
    const result = await this.dispatch({
      template,
      targets: [{ customerId: customer.id, phone: customer.phone || '' }],
      skipped: [],
      requested: 1,
      source: 'claim',
      filter: { source: 'claim', templateId },
      options: { requestKey: `claim:${customer.id}:${templateId}:${existing.length + 1}` },
      actor: {
        ...SYSTEM_ACTOR,
        id: `customer:${customer.id}`,
        username: '',
        name: customer.name || '会员'
      }
    });
    // 重复点击命中幂等键时 issued 为空：直接回传最近领到的那张券，前端按成功处理。
    const recent = result.issued.length
      ? null
      : await this.prisma.customerCoupon.findFirst({
          where: { customerId: customer.id, couponId: templateId },
          orderBy: { issuedAt: 'desc' },
          select: { id: true }
        });
    const recordId = result.issued.length ? result.issued[0].couponId : recent?.id || '';
    if (!recordId) {
      // 并发领取时第二个请求在事务里被「已有未使用券」挡下。
      throw badRequest('你已有一张未使用的同款券');
    }
    const row = await this.prisma.customerCoupon.findUnique({
      where: { id: recordId },
      include: { coupon: true }
    });
    const names = await this.productNames([row?.coupon.productId || null]);
    return {
      coupon: row
        ? mapCustomerCoupon(row, Date.now(), row.coupon.productId ? names.get(row.coupon.productId) || '' : '')
        : null,
      remain: Math.max(template.claimLimit - existing.length - 1, 0)
    };
  }

  private async productNames(ids: Array<string | null>): Promise<Map<string, string>> {
    const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
    if (!unique.length) return new Map();
    const rows = await this.prisma.product.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true }
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  /**
   * 下单核验：归属、状态、有效期（以本张券的实例有效期为准）、品类/单品范围与门槛全部由服务端判定。
   * 折扣只作用于券可用商品的实付小计，不触碰不可用商品。
   */
  async resolveForOrder(params: {
    customerId: string;
    couponId: string;
    lines: Array<{ categoryId: string; productId?: string; totalCents: number }>;
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
    if (row.status !== 'available' && !retrying) {
      throw badRequest(row.status === 'revoked' ? '优惠券已作废' : '优惠券不可用或已使用');
    }
    const coupon = row.coupon;
    const now = Date.now();
    if (!coupon.active) throw badRequest('优惠券已停用');
    if (now < row.validFrom.getTime()) throw badRequest('优惠券尚未生效');
    if (now > row.validTo.getTime()) throw badRequest('优惠券已过期');
    const eligible = params.lines
      .filter((line) => this.lineInScope(coupon, line))
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

  /** 单品券按商品 id、品类券按分类 id、通用券全部命中；范围判定只在这里维护一份。 */
  private lineInScope(
    coupon: { scope: string; categoryId: string | null; productId: string | null },
    line: { categoryId: string; productId?: string }
  ): boolean {
    if (coupon.scope === 'all') return true;
    if (coupon.scope === 'category') return Boolean(coupon.categoryId) && line.categoryId === coupon.categoryId;
    if (coupon.scope === 'product') return Boolean(coupon.productId) && line.productId === coupon.productId;
    return false;
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

/** 筛选条件的单日边界，同样按中国时区自然日。 */
function dayStart(text: string): Date {
  const date = new Date(`${String(text).trim()}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) throw badRequest('日期格式不正确，应为 YYYY-MM-DD');
  return date;
}

function dayEnd(text: string): Date {
  const date = new Date(`${String(text).trim()}T23:59:59.999+08:00`);
  if (Number.isNaN(date.getTime())) throw badRequest('日期格式不正确，应为 YYYY-MM-DD');
  return date;
}

/** 业务端手机号脱敏：保留前 3 位与后 4 位，中间固定 4 个星号。 */
function maskPhone(phone: string | null): string {
  const text = String(phone || '').trim();
  if (!text) return '—';
  if (text.length < 7) return `${text.slice(0, 1)}****`;
  return `${text.slice(0, 3)}****${text.slice(-4)}`;
}

/** 批次筛选快照只做展示，历史脏数据不能让列表 500。 */
function parseFilterSnapshot(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

type IssueTarget = { customerId: string; phone: string };
