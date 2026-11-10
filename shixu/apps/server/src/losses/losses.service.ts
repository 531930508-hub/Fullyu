import { Injectable } from '@nestjs/common';
import { monthRange, type DateRange } from '@teahour/shared';
import { PrismaService } from '../common/prisma.service';
import { assertStoreAccess, hasPerm, type StaffContext } from '../common/auth.types';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { newId } from '../common/ids';
import { logAction } from '../common/logs';
import { HardwareService } from '../hardware/hardware.module';
import { Prisma, type Loss } from '@prisma/client';

/** 报损执行可并入外部事务（审批决定 + 执行同事务，TX-09）。 */
type LossTx = Prisma.TransactionClient | PrismaService;

export type LossPolicy = {
  enabled: boolean;
  monthlyRatio: number;
  approvalThresholdCents: number;
  approvers: string[];
};

const DEFAULT_POLICY: LossPolicy = {
  enabled: true,
  monthlyRatio: 3,
  approvalThresholdCents: 10000,
  approvers: ['u-zhou', 'u-lin']
};

@Injectable()
export class LossesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hardware: HardwareService
  ) {}

  async getPolicy(): Promise<LossPolicy> {
    const row = await this.prisma.setting.findUnique({ where: { key: 'lossPolicy' } });
    return row ? (JSON.parse(row.valueJson) as LossPolicy) : { ...DEFAULT_POLICY };
  }

  async savePolicy(staff: StaffContext, input: Partial<LossPolicy>) {
    if (!hasPerm(staff, 'loss:config')) throw forbidden('没有维护报损规则的权限');
    const current = await this.getPolicy();
    const ratio = input.monthlyRatio == null ? current.monthlyRatio : Number(input.monthlyRatio);
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 100) throw badRequest('月度损耗率预警线应在 0–100 之间');
    const threshold =
      input.approvalThresholdCents == null
        ? current.approvalThresholdCents
        : Math.round(Number(input.approvalThresholdCents));
    if (!Number.isFinite(threshold) || threshold < 0) throw badRequest('审批起点金额无效');
    const approvers = Array.from(new Set((input.approvers || current.approvers || []).filter(Boolean)));
    const users = await this.prisma.user.findMany({
      where: { id: { in: approvers }, active: true },
      select: { id: true }
    });
    const active = approvers.filter((id) => users.some((user) => user.id === id));
    if (!active.length) throw badRequest('请至少选择一位启用中的报损审批人');
    const policy: LossPolicy = {
      enabled: input.enabled == null ? current.enabled : Boolean(input.enabled),
      monthlyRatio: ratio,
      approvalThresholdCents: threshold,
      approvers: active
    };
    await this.prisma.setting.upsert({
      where: { key: 'lossPolicy' },
      create: { key: 'lossPolicy', valueJson: JSON.stringify(policy), updatedAt: new Date() },
      update: { valueJson: JSON.stringify(policy), updatedAt: new Date() }
    });
    await logAction(this.prisma, {
      actorId: staff.id,
      actorName: staff.name,
      action: '更新报损规则',
      detail: `月度损耗率 >${ratio}% 预警 · 审批起点 ¥${(threshold / 100).toFixed(2)} · ${active.length} 位审批人`,
      type: 'loss'
    });
    return policy;
  }

  async report(
    staff: StaffContext,
    input: { storeId?: string; productId?: string; qty?: number; reason?: string; note?: string }
  ) {
    if (!hasPerm(staff, 'loss:report')) throw forbidden('没有登记报损的权限');
    const policy = await this.getPolicy();
    if (!policy.enabled) throw conflict('报损功能已停用，请联系总部');
    const storeId = String(input.storeId || '');
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw badRequest('请选择有效门店');
    assertStoreAccess(staff, storeId);
    const product = await this.prisma.product.findUnique({ where: { id: String(input.productId || '') } });
    if (!product) throw notFound('商品不存在');
    const rawQty = Number(input.qty);
    const qty = product.kind === 'tea' ? Math.round(rawQty * 10) / 10 : rawQty;
    if (!Number.isFinite(qty) || qty <= 0) throw badRequest('请填写有效的报损数量');
    if (product.kind !== 'tea' && !Number.isInteger(qty)) throw badRequest('整件商品报损须为整数');
    const stock = await this.prisma.stock.findUnique({
      where: { storeId_productId: { storeId, productId: product.id } }
    });
    const have = stock?.grams || 0;
    if (have < qty) {
      throw conflict(`本店 ${product.name} 库存仅 ${have}${product.kind === 'tea' ? 'g' : '件'}，请核对后重试`);
    }
    const reason = String(input.reason || '').trim();
    if (!reason) throw badRequest('请选择或填写报损原因');
    const { amountCents, unit } = this.lossValue(product, qty);
    const needsApproval = policy.approvalThresholdCents > 0 && amountCents >= policy.approvalThresholdCents;
    const now = new Date();
    const id = newId('LS');
    const approvalId = needsApproval ? newId('AP') : null;
    await this.prisma.$transaction(async (tx) => {
      if (!needsApproval) {
        const result = await tx.stock.updateMany({
          where: { storeId, productId: product.id, grams: { gte: qty } },
          data: { grams: { decrement: qty } }
        });
        if (!result.count) throw conflict('本店库存不足，无法完成报损扣减');
      }
      await tx.loss.create({
        data: {
          id,
          storeId,
          productId: product.id,
          name: product.name,
          kind: product.kind,
          qty,
          unit,
          amountCents,
          reason,
          note: String(input.note || '').trim().slice(0, 200),
          status: needsApproval ? 'pending' : 'approved',
          reportedBy: staff.id,
          decidedBy: needsApproval ? null : staff.id,
          decidedAt: needsApproval ? null : now,
          decisionNote: needsApproval ? '' : '未达审批线，门店已登记',
          approvalId,
          at: now
        }
      });
      if (approvalId) {
        await tx.approval.create({
          data: {
            id: approvalId,
            kind: 'LOSS',
            status: 'pending',
            amountCents,
            storeId,
            orderId: null,
            summary: `报损申请：${product.name} · ${qty}${unit} · ¥${(amountCents / 100).toFixed(2)} · ${reason}`,
            payloadJson: JSON.stringify({ lossId: id, productId: product.id, qty, storeId }),
            requestedBy: staff.id,
            createdAt: now
          }
        });
      }
      await logAction(tx, {
        actorId: staff.id,
        actorName: staff.name,
        action: needsApproval ? '提交超限报损' : '登记门店报损',
        detail: `${store.name} · ${product.name} ${qty}${unit} · ¥${(amountCents / 100).toFixed(2)} · ${reason}`,
        type: 'loss',
        storeId,
        at: now.getTime()
      });
    });
    return this.getLoss(id);
  }

  private lossValue(product: { kind: string; doseG: number; costCents: number; unitZh: string }, qty: number) {
    if (product.kind === 'tea') {
      if (qty > 100000) throw badRequest('单次报损数量过大，请分批登记');
      return { amountCents: Math.round((qty / product.doseG) * product.costCents), unit: 'g' };
    }
    return { amountCents: qty * product.costCents, unit: product.unitZh };
  }

  /**
   * TX-09：批准 = 同一事务内条件认领报损（pending → approved）+ 条件扣减库存。
   * 双人并发只有一个胜者；库存不足整体回滚（含认领），报损保持待办。
   * 允许传入外部事务句柄（审批决定与执行同事务），缺省自起事务。
   */
  async approve(staff: StaffContext, lossId: string, tx?: LossTx) {
    const run = async (db: LossTx) => {
      const claim = await db.loss.updateMany({
        where: { id: lossId, status: 'pending' },
        data: {
          status: 'approved',
          decidedBy: staff.id,
          decidedAt: new Date(),
          decisionNote: '总部复核通过'
        }
      });
      if (!claim.count) throw conflict('该报损不在待审批状态');
      const loss = await db.loss.findUnique({ where: { id: lossId } });
      if (!loss) throw notFound('报损记录不存在');
      const result = await db.stock.updateMany({
        where: { storeId: loss.storeId, productId: loss.productId, grams: { gte: loss.qty } },
        data: { grams: { decrement: loss.qty } }
      });
      if (!result.count) throw conflict('本店库存不足，无法完成报损扣减');
      await logAction(db, {
        actorId: staff.id,
        actorName: staff.name,
        action: '审批通过报损',
        detail: `${loss.name} ${loss.qty}${loss.unit} · ¥${(loss.amountCents / 100).toFixed(2)}`,
        type: 'loss',
        storeId: loss.storeId
      });
      return loss.id;
    };
    if (tx) {
      await run(tx);
      return null; // 外部事务场景由调用方负责回读，避免在事务内另起连接
    }
    await this.prisma.$transaction(run);
    return this.getLoss(lossId);
  }

  /** TX-09：驳回同样条件认领；可并入外部事务，与审批行更新保持原子。 */
  async reject(staff: StaffContext, lossId: string, comment: string, tx?: LossTx) {
    const run = async (db: LossTx) => {
      const claim = await db.loss.updateMany({
        where: { id: lossId, status: 'pending' },
        data: {
          status: 'rejected',
          decidedBy: staff.id,
          decidedAt: new Date(),
          decisionNote: String(comment || '总部驳回').slice(0, 200)
        }
      });
      if (!claim.count) throw conflict('该报损不在待审批状态');
      const loss = await db.loss.findUnique({ where: { id: lossId } });
      if (!loss) throw notFound('报损记录不存在');
      await logAction(db, {
        actorId: staff.id,
        actorName: staff.name,
        action: '驳回报损',
        detail: `${loss.name} ${loss.qty}${loss.unit}${comment ? ` · ${comment}` : ''}`,
        type: 'loss',
        storeId: loss.storeId
      });
    };
    if (tx) {
      await run(tx);
      return null;
    }
    await this.prisma.$transaction(run);
    return this.getLoss(lossId);
  }

  async getLoss(id: string) {
    const row = await this.prisma.loss.findUnique({ where: { id } });
    if (!row) throw notFound('报损记录不存在');
    const store = await this.prisma.store.findUnique({ where: { id: row.storeId } });
    return this.mapLoss(row, store?.name ?? null);
  }

  private mapLoss(row: Loss, storeName: string | null) {
    return {
      id: row.id,
      storeId: row.storeId,
      storeName: storeName || row.storeId,
      productId: row.productId,
      name: row.name,
      kind: row.kind,
      qty: row.qty,
      unit: row.unit,
      amountCents: row.amountCents,
      reason: row.reason,
      note: row.note,
      status: row.status,
      reportedBy: row.reportedBy,
      decidedBy: row.decidedBy,
      decidedAt: row.decidedAt ? row.decidedAt.getTime() : null,
      decisionNote: row.decisionNote,
      approvalId: row.approvalId,
      at: row.at.getTime()
    };
  }

  async list(options: { storeIds: string[]; range?: DateRange; status?: string; limit?: number }) {
    // SEC-04：空门店范围 = 什么都看不到（fail closed），绝不能退化成全库查询。
    if (!options.storeIds.length) return [];
    const rows = await this.prisma.loss.findMany({
      where: {
        storeId: { in: options.storeIds },
        ...(options.range
          ? { at: { gte: new Date(options.range.from), lt: new Date(options.range.to) } }
          : {}),
        ...(options.status && options.status !== 'all' ? { status: options.status } : {})
      },
      orderBy: { at: 'desc' },
      take: options.limit || 200
    });
    const stores = await this.prisma.store.findMany();
    const names = new Map(stores.map((s) => [s.id, s.name]));
    return rows.map((row) => this.mapLoss(row, names.get(row.storeId) ?? null));
  }

  async summary(options: { range?: DateRange; storeIds: string[] }) {
    const range = options.range || monthRange();
    const policy = await this.getPolicy();
    const scope = options.storeIds.length ? options.storeIds : [];
    const rows = [];
    for (const storeId of scope) {
      const store = await this.prisma.store.findUnique({ where: { id: storeId } });
      const list = (await this.list({ storeIds: [storeId], range, limit: 500 })).filter(
        (x) => x.status !== 'rejected'
      );
      const approved = list.filter((x) => x.status === 'approved');
      const pending = list.filter((x) => x.status === 'pending');
      const sales = await this.prisma.financeEntry.aggregate({
        where: {
          storeId,
          type: 'SALE',
          at: { gte: new Date(range.from), lt: new Date(range.to) }
        },
        _sum: { amountCents: true }
      });
      const salesCents = sales._sum.amountCents || 0;
      const amount = approved.reduce((n, x) => n + x.amountCents, 0);
      const ratio = salesCents > 0 ? (amount / salesCents) * 100 : 0;
      rows.push({
        storeId,
        store: store?.name || storeId,
        amountCents: amount,
        pendingCents: pending.reduce((n, x) => n + x.amountCents, 0),
        salesCents,
        ratio,
        limit: policy.monthlyRatio,
        count: approved.length,
        pending: pending.length,
        warning: policy.enabled && salesCents > 0 && ratio > policy.monthlyRatio,
        recent: list.slice(0, 8)
      });
    }
    return {
      from: range.from,
      to: range.to,
      rows,
      totalCents: rows.reduce((n, x) => n + x.amountCents, 0),
      pendingTotalCents: rows.reduce((n, x) => n + x.pendingCents, 0)
    };
  }

  async deviceStatuses() {
    const [printer, machines, payment] = await Promise.all([
      this.hardware.printer.status(),
      this.hardware.teaMachine.status(),
      this.hardware.payment.status()
    ]);
    return {
      printer,
      machines,
      payment,
      platform: { mode: this.hardware.platform.mode },
      member: { mode: this.hardware.member.mode }
    };
  }
}
