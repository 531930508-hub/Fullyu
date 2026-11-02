import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { assertStoreAccess, hasPerm, type StaffContext } from '../common/auth.types';
import { conflict, forbidden, notFound } from '../common/errors';
import { logAction } from '../common/logs';
import { OrdersService, type RefundLineInput } from '../orders/orders.service';
import { LossesService } from '../losses/losses.service';
import type { Approval } from '@prisma/client';

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly losses: LossesService
  ) {}

  private async mapApproval(row: Approval) {
    const [requester, store, order] = await Promise.all([
      row.requestedBy ? this.prisma.user.findUnique({ where: { id: row.requestedBy } }) : null,
      row.storeId && row.storeId !== 'brand'
        ? this.prisma.store.findUnique({ where: { id: row.storeId } })
        : null,
      row.orderId ? this.prisma.order.findUnique({ where: { id: row.orderId } }) : null
    ]);
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      amountCents: row.amountCents,
      storeId: row.storeId,
      storeName: row.storeId === 'brand' ? '品牌零售' : store?.name || row.storeId,
      orderId: row.orderId,
      orderNumber: order?.number ?? null,
      summary: row.summary,
      requestedBy: row.requestedBy,
      requesterName: requester?.name || row.requestedBy,
      decidedBy: row.decidedBy,
      comment: row.comment,
      resultNote: row.resultNote,
      // TX-12：审批决定（status）与退款执行（executionStatus/refundIntentId）分开呈现，
      // "批准成立"与"钱已退回"不再是同一个信号，失败/未知可观察、可重试。
      executionStatus: row.executionStatus,
      refundIntentId: row.refundIntentId,
      createdAt: row.createdAt.getTime(),
      decidedAt: row.decidedAt ? row.decidedAt.getTime() : null,
      payload: JSON.parse(row.payloadJson) as Record<string, unknown>
    };
  }

  async list(options: { storeIds: string[]; status?: string; kind?: string; limit?: number }) {
    // SEC-04：空门店范围 = 什么都看不到（fail closed），绝不能退化成全库查询。
    if (!options.storeIds.length) return [];
    const rows = await this.prisma.approval.findMany({
      where: {
        storeId: { in: options.storeIds },
        ...(options.status && options.status !== 'all' ? { status: options.status } : {}),
        ...(options.kind && options.kind !== 'all' ? { kind: options.kind } : {})
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: options.limit || 200
    });
    return Promise.all(rows.map((row) => this.mapApproval(row)));
  }

  private async load(id: string): Promise<Approval> {
    const row = await this.prisma.approval.findUnique({ where: { id } });
    if (!row) throw notFound('审批记录不存在');
    return row;
  }

  private assertApprover(staff: StaffContext, approval: Approval): void {
    const permission = approval.kind === 'REFUND' ? 'order:refund:approve' : 'loss:approve';
    if (!hasPerm(staff, permission)) throw forbidden('当前账号没有该审批权限');
    if (approval.storeId) assertStoreAccess(staff, approval.storeId);
  }

  async decide(
    staff: StaffContext,
    id: string,
    input: { decision: 'approve' | 'reject'; comment?: string }
  ) {
    const approval = await this.load(id);
    if (approval.status !== 'pending') throw conflict('该审批已处理');
    this.assertApprover(staff, approval);
    const comment = String(input.comment || '').slice(0, 200);

    if (input.decision === 'reject') {
      // TX-09/12：条件认领审批行，与并发批准只有一个胜者；
      // 退款一旦进入执行（executionStatus 非空）不可再驳回，防止"钱已退、单显示驳回"。
      await this.prisma.$transaction(async (tx) => {
        const claim = await tx.approval.updateMany({
          where: {
            id,
            status: 'pending',
            ...(approval.kind === 'REFUND' ? { executionStatus: '' } : {})
          },
          data: {
            status: 'rejected',
            decidedBy: staff.id,
            comment,
            decidedAt: new Date(),
            executionStatus: 'rejected'
          }
        });
        if (!claim.count) throw conflict('该审批已处理或退款已在执行中，无法驳回');
        if (approval.kind === 'LOSS') {
          const payload = JSON.parse(approval.payloadJson) as { lossId: string };
          await this.losses.reject(staff, payload.lossId, comment, tx);
        }
        if (approval.orderId) {
          await tx.order.update({ where: { id: approval.orderId }, data: { refundPending: false } });
        }
        await logAction(tx, {
          actorId: staff.id,
          actorName: staff.name,
          action: approval.kind === 'REFUND' ? '驳回退款申请' : '驳回报损',
          detail: `${approval.summary}${comment ? ` · ${comment}` : ''}`,
          type: 'approval',
          storeId: approval.storeId,
          orderId: approval.orderId
        });
      });
      return this.mapApproval(await this.load(id));
    }

    if (approval.kind === 'LOSS') {
      const payload = JSON.parse(approval.payloadJson) as { lossId: string };
      // TX-09：审批行更新与报损执行同事务——并发/中断都不会出现"扣了库存但审批仍待办"。
      await this.prisma.$transaction(async (tx) => {
        await this.losses.approve(staff, payload.lossId, tx);
        const claim = await tx.approval.updateMany({
          where: { id, status: 'pending' },
          data: {
            status: 'approved',
            decidedBy: staff.id,
            comment,
            resultNote: '已通过，库存与成本已扣减',
            decidedAt: new Date(),
            executionStatus: 'approved'
          }
        });
        if (!claim.count) throw conflict('该审批已处理');
        await logAction(tx, {
          actorId: staff.id,
          actorName: staff.name,
          action: '审批通过报损',
          detail: approval.summary,
          type: 'approval',
          storeId: approval.storeId
        });
      });
      return this.mapApproval(await this.load(id));
    }

    const payload = JSON.parse(approval.payloadJson) as {
      lines: RefundLineInput[];
      reason?: string;
      prepared?: boolean;
    };
    let resultNote = '';
    let preExecFailed = false;
    try {
      const order = await this.orders.getOrderRow(approval.orderId || '');
      const quote = await this.orders.refundQuoteForOrder(order.id, payload.lines);
      const result = await this.orders.executeRefund(staff, {
        order,
        quote: quote.quote,
        reason: payload.reason || '审批通过退款',
        prepared: await this.orders.isOrderPrepared(order.id),
        approvalId: approval.id,
        decidedBy: staff.name
      });
      resultNote = result.error
        ? `审批通过但退款执行失败：${result.error}`
        : `已退款 ¥${(result.refundedCents / 100).toFixed(2)}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // 事务内条件认领失败 = 并发决定的败者：不落批准态，让胜者的决定生效。
      if (message.includes('该审批已被处理')) throw conflict('该审批已处理');
      resultNote = `审批通过但退款执行失败：${message}`;
      preExecFailed = true;
    }
    const now = new Date();
    // 执行状态由 executeRefund 占用/确认/释放链维护；仅"执行尚未开始就失败"时补记 failed。
    const freshApproval = await this.load(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.approval.update({
        where: { id },
        data: {
          status: 'approved',
          decidedBy: staff.id,
          comment,
          resultNote,
          decidedAt: now,
          ...(preExecFailed && !freshApproval.executionStatus
            ? { executionStatus: 'failed' as string }
            : {})
        }
      });
      if (approval.orderId) {
        await tx.order.update({ where: { id: approval.orderId }, data: { refundPending: false } });
      }
    });
    await logAction(this.prisma, {
      actorId: staff.id,
      actorName: staff.name,
      action: '审批退款',
      detail: `${approval.summary} · ${resultNote}`,
      type: 'approval',
      storeId: approval.storeId,
      orderId: approval.orderId
    });
    return this.mapApproval(await this.load(id));
  }

  async counts(storeIds: string[]) {
    // SEC-04：空门店范围 = 没有任何待办（fail closed）。
    if (!storeIds.length) return { pending: 0, approved: 0, rejected: 0 };
    const rows = await this.prisma.approval.groupBy({
      by: ['status'],
      where: { storeId: { in: storeIds } },
      _count: { _all: true }
    });
    const map = Object.fromEntries(rows.map((x) => [x.status, x._count._all]));
    return { pending: map.pending || 0, approved: map.approved || 0, rejected: map.rejected || 0 };
  }
}
