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
import { maskPhone, normalizePhone, phoneSearchTerms } from '../common/phone';

export type SingleInput = { memberId: string; points: number; reason: string; ref?: string };
/** 批量只收手机号：员工不需要记会员号或业务端用户号。 */
export type BatchInput = { reason: string; lines: BatchLineInput[] };

type BatchLineInput = { phone: string; points: number };

/** 落库时连同会员号与手机号一起快照，审批与审计不必再猜内部 id。 */
type StoredLine = AdjustmentLine & { memberNo: string; phone: string };

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
        return { status: 'PENDING', request: this.publicRequest(request) };
      }
    );
  }

  async createBatch(input: BatchInput, actor: StaffContext, idemKey?: string) {
    this.validateReason(input.reason);
    const rawLines = Array.isArray(input.lines) ? input.lines : [];
    if (!rawLines.length) throw badRequest('批量调整至少一行');
    if (rawLines.length > 50) throw badRequest('单次批量最多 50 行');
    const lines = await this.resolvePhones(rawLines);
    for (const [index, line] of lines.entries()) {
      if (line.points < 0 && (await this.points.balance(line.memberId)) < -line.points) {
        throw badRequest(`第 ${index + 1} 行：会员 ${line.memberNo} 积分余额不足，整单未提交`);
      }
    }

    // 幂等键按解析后的会员 id 计算：手机号写法变化不影响重试，换绑手机号则视为不同请求。
    const fingerprint = {
      reason: input.reason.trim(),
      lines: lines.map((line) => ({ memberId: line.memberId, points: line.points }))
    };
    return runIdempotent<{ status: string; request: unknown }>(this.prisma, idemKey, fingerprint, async () => {
      const request = await this.createRequest('BATCH', input.reason, lines, actor);
      await audit(this.prisma, {
        actor,
        action: '发起批量积分调整',
        target: request.id,
        detail: `${lines.length} 人 · ${input.reason}`
      });
      return { status: 'PENDING', request: this.publicRequest(request) };
    });
  }

  /**
   * 手机号是员工唯一需要知道的会员入口：
   * - 先归一化，兼容 +86 / 0086 / 空格 / 横线；
   * - 一次查询解析整批，避免前端拉全量会员；
   * - 错误带行号，重复号码和一人多号都拦在提交前。
   */
  private async resolvePhones(rawLines: BatchLineInput[]): Promise<StoredLine[]> {
    const parsed = rawLines.map((line, index) => {
      const row = index + 1;
      if (!Number.isInteger(line.points) || line.points === 0) {
        throw badRequest(`第 ${row} 行：分值必须是非零整数`);
      }
      const rawPhone = typeof line.phone === 'string' ? line.phone.trim() : '';
      if (!rawPhone) throw badRequest(`第 ${row} 行：请填写手机号`);
      const phone = normalizePhone(rawPhone);
      if (!phone) throw badRequest(`第 ${row} 行：手机号格式不正确`);
      return { row, phone, points: line.points, terms: phoneSearchTerms(phone) };
    });

    const firstRowByPhone = new Map<string, number>();
    for (const line of parsed) {
      const seen = firstRowByPhone.get(line.phone);
      if (seen) throw badRequest(`第 ${line.row} 行：手机号与第 ${seen} 行重复`);
      firstRowByPhone.set(line.phone, line.row);
    }

    const variants = [...new Set(parsed.flatMap((line) => line.terms))];
    const members = await this.prisma.member.findMany({
      where: { phone: { in: variants } },
      select: { id: true, memberNo: true, phone: true, name: true, status: true }
    });

    return parsed.map((line) => {
      // 兼容历史数据里 +86 前缀未归一化的手机号；同一号码命中多人则要求先合并档案。
      const matches = members.filter((member) => member.phone && line.terms.includes(member.phone));
      if (!matches.length) throw badRequest(`第 ${line.row} 行：找不到手机号 ${line.phone} 对应的会员`);
      if (matches.length > 1) {
        throw badRequest(`第 ${line.row} 行：手机号 ${line.phone} 匹配到多个会员，请先在会员档案处理`);
      }
      const [member] = matches;
      if (member.status !== 'ACTIVE') {
        throw badRequest(`第 ${line.row} 行：会员 ${member.name}（${member.memberNo}）不是有效状态`);
      }
      return {
        memberId: member.id,
        points: line.points,
        memberNo: member.memberNo,
        phone: member.phone || line.phone
      };
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
      return { status: 'REJECTED', request: this.publicRequest(claimed) };
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
      return { status: 'APPLIED', applied: applied.result, request: this.publicRequest(applied.updated) };
    } catch (error) {
      // 审批时复核失败：整单已回滚、单据仍待审批；不把内部异常当成功。
      if (error instanceof ApiError) throw error;
      throw unprocessable('审批时复核失败，整单未执行');
    }
  }

  async list(status?: string) {
    const where: Prisma.AdjustmentRequestWhereInput = {};
    if (status) where.status = status;
    const rows = await this.prisma.adjustmentRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    // 明细只在详情里按行返回；列表不带 payload，避免手机号整包外泄。
    return rows.map((row) => this.publicRequest(row));
  }

  async detail(id: string) {
    const stored = await this.prisma.adjustmentRequest.findUnique({ where: { id } });
    if (!stored) throw notFound('调整单不存在');
    const lines = JSON.parse(stored.payloadJson) as (AdjustmentLine & {
      memberNo?: string;
      phone?: string;
    })[];
    const members = await this.prisma.member.findMany({
      where: { id: { in: [...new Set(lines.map((line) => line.memberId))] } },
      select: { id: true, memberNo: true, name: true, phone: true, status: true }
    });
    const byId = new Map(members.map((member) => [member.id, member]));
    return {
      request: this.publicRequest(stored),
      lines: lines.map((line) => {
        const member = byId.get(line.memberId);
        return {
          memberId: line.memberId,
          points: line.points,
          memberNo: line.memberNo || member?.memberNo || '',
          name: member?.name || '（会员不存在）',
          // 审批页只展示脱敏手机号；完整号码留在会员档案里。
          phoneMasked: maskPhone(line.phone || member?.phone || null),
          memberStatus: member?.status || 'MISSING'
        };
      })
    };
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

  /** 调整单对外只暴露业务字段，手机号快照不随整单 JSON 外泄。 */
  private publicRequest<T extends { payloadJson: string }>(request: T): Omit<T, 'payloadJson'> {
    const { payloadJson, ...rest } = request;
    return rest;
  }

  private validateReason(reason: string) {
    const text = (reason || '').trim();
    if (text.length < 2) throw badRequest('请填写调整原因（至少 2 个字）');
    if (text.length > 200) throw badRequest('调整原因最多 200 字');
  }
}
