import { Injectable } from '@nestjs/common';
import { ADJUST_FREE_LIMIT } from '@fullyu/crm-shared';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { PointsService, type AdjustmentLine } from './points.service';
import { ApiError, badRequest, conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { newId } from '../common/ids';
import { audit } from '../common/audit';
import type { StaffContext } from '../common/auth.types';
import { runIdempotent } from '../common/idempotency';

export type SingleInput = { memberId: string; points: number; reason: string; ref?: string };
export type BatchInput = { reason: string; lines: AdjustmentLine[] };

@Injectable()
export class AdjustmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly points: PointsService
  ) {}

  async createSingle(input: SingleInput, actor: StaffContext, idemKey?: string) {
    this.validateReason(input.reason);
    if (!Number.isInteger(input.points) || input.points === 0) throw badRequest('调整分值必须是非零整数');
    const member = await this.prisma.member.findUnique({ where: { id: input.memberId } });
    if (!member) throw notFound('会员不存在');
    if (member.status !== 'ACTIVE') throw badRequest('该会员不是有效状态，不能调整');
    if (input.points < 0 && (await this.points.balance(member.id)) < -input.points) {
      throw unprocessable('积分余额不足');
    }

    return runIdempotent<{ status: string; balance?: number; ledgerId?: string; request?: unknown }>(
      this.prisma,
      idemKey,
      input,
      async () => {
        if (Math.abs(input.points) <= ADJUST_FREE_LIMIT) {
          const actionId = newId('ADJ');
          const result = await this.prisma.$transaction(async (tx) => {
            const [applied] = await this.points.apply(
              tx,
              [{ memberId: input.memberId, points: input.points }],
              this.meta(actor, input.reason, actionId)
            );
            return { status: 'APPLIED', balance: applied.balance, ledgerId: applied.ledgerId };
          });
          await audit(this.prisma, {
            actor,
            action: '积分调整',
            target: member.memberNo,
            detail: `${input.points > 0 ? '+' : ''}${input.points} · ${input.reason}`
          });
          return result;
        }
        const request = await this.createRequest(
          'SINGLE',
          input.reason,
          [{ memberId: input.memberId, points: input.points }],
          actor
        );
        await audit(this.prisma, {
          actor,
          action: '发起积分调整',
          target: request.id,
          detail: `${input.points > 0 ? '+' : ''}${input.points} 分待审批 · ${input.reason}`
        });
        return { status: 'PENDING', request };
      }
    );
  }

  async createBatch(input: BatchInput, actor: StaffContext, idemKey?: string) {
    this.validateReason(input.reason);
    const lines = input.lines || [];
    if (!lines.length) throw badRequest('批量调整至少一行');
    if (lines.length > 50) throw badRequest('单次批量最多 50 行');
    const ids = lines.map((line) => line.memberId);
    if (new Set(ids).size !== ids.length) throw badRequest('同一会员在一批中只能出现一次');
    const members = await this.prisma.member.findMany({ where: { id: { in: ids } } });
    if (members.length !== ids.length) throw badRequest('存在不存在的会员');
    for (const member of members) {
      if (member.status !== 'ACTIVE') throw badRequest(`会员 ${member.memberNo} 不是有效状态，不能调整`);
    }
    for (const line of lines) {
      if (!Number.isInteger(line.points) || line.points === 0) throw badRequest('每行分值必须是非零整数');
      if (line.points < 0 && (await this.points.balance(line.memberId)) < -line.points) {
        throw badRequest('存在余额不足的扣减行，整单未提交');
      }
    }

    return runIdempotent<{ status: string; request: unknown }>(this.prisma, idemKey, input, async () => {
      const request = await this.createRequest('BATCH', input.reason, lines, actor);
      await audit(this.prisma, {
        actor,
        action: '发起批量积分调整',
        target: request.id,
        detail: `${lines.length} 人 · ${input.reason}`
      });
      return { status: 'PENDING', request };
    });
  }

  async decide(
    id: string,
    action: 'approve' | 'reject',
    comment: string,
    actor: StaffContext
  ): Promise<{ status: string; request?: unknown; applied?: unknown }> {
    const request = await this.prisma.adjustmentRequest.findUnique({ where: { id } });
    if (!request) throw notFound('调整单不存在');
    if (request.requestedBy === actor.id) throw forbidden('审批人不能是发起人');
    if (request.status !== 'PENDING') throw conflict('该调整单已处理');

    if (action === 'reject') {
      const text = (comment || '').trim();
      if (text.length < 2) throw badRequest('驳回必须填写意见');
      // 条件更新一次性占用待审批状态，避免并发/重试重复处理。
      const claimed = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.adjustmentRequest.updateMany({
          where: { id, status: 'PENDING' },
          data: {
            status: 'REJECTED',
            approvedBy: actor.id,
            approvedByName: actor.name,
            comment: text,
            decidedAt: new Date()
          }
        });
        if (updated.count !== 1) throw conflict('该调整单已处理');
        return tx.adjustmentRequest.findUniqueOrThrow({ where: { id } });
      });
      await audit(this.prisma, { actor, action: '驳回积分调整', target: id, detail: text });
      return { status: 'REJECTED', request: claimed };
    }

    const lines = JSON.parse(request.payloadJson) as AdjustmentLine[];
    try {
      const applied = await this.prisma.$transaction(async (tx) => {
        // 先条件占用 PENDING，成功后才入账；入账失败与占用一起回滚，单据仍待审批。
        const claimed = await tx.adjustmentRequest.updateMany({
          where: { id, status: 'PENDING' },
          data: {
            status: 'APPLIED',
            approvedBy: actor.id,
            approvedByName: actor.name,
            comment: (comment || '').trim(),
            decidedAt: new Date(),
            appliedAt: new Date()
          }
        });
        if (claimed.count !== 1) throw conflict('该调整单已处理');
        const result = await this.points.apply(tx, lines, this.meta(actor, request.reason, id));
        return {
          result,
          updated: await tx.adjustmentRequest.findUniqueOrThrow({ where: { id } })
        };
      });
      await audit(this.prisma, {
        actor,
        action: '批准积分调整',
        target: id,
        detail: `${lines.length} 行`
      });
      return { status: 'APPLIED', applied: applied.result, request: applied.updated };
    } catch (error) {
      // 审批时复核失败：整单已回滚、单据仍待审批；不把内部异常当成功。
      if (error instanceof ApiError) throw error;
      throw unprocessable('审批时复核失败，整单未执行');
    }
  }

  async list(status?: string) {
    const where: Prisma.AdjustmentRequestWhereInput = {};
    if (status) where.status = status;
    return this.prisma.adjustmentRequest.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async detail(id: string) {
    const request = await this.prisma.adjustmentRequest.findUnique({ where: { id } });
    if (!request) throw notFound('调整单不存在');
    return { request, lines: JSON.parse(request.payloadJson) as AdjustmentLine[] };
  }

  private async createRequest(
    kind: 'SINGLE' | 'BATCH',
    reason: string,
    lines: AdjustmentLine[],
    actor: StaffContext
  ) {
    return this.prisma.adjustmentRequest.create({
      data: {
        id: newId('ADJ'),
        kind,
        reason: reason.trim(),
        totalPoints: lines.reduce((sum, line) => sum + line.points, 0),
        payloadJson: JSON.stringify(lines),
        requestedBy: actor.id,
        requestedByName: actor.name
      }
    });
  }

  private meta(actor: StaffContext, reason: string, ref: string) {
    return {
      business: 'hq',
      ref,
      operatorId: actor.id,
      operatorName: actor.name,
      note: reason.trim(),
      idemPrefix: `adj:${ref}`
    };
  }

  private validateReason(reason: string) {
    const text = (reason || '').trim();
    if (text.length < 2) throw badRequest('请填写调整原因（至少 2 个字）');
    if (text.length > 200) throw badRequest('调整原因最多 200 字');
  }
}
