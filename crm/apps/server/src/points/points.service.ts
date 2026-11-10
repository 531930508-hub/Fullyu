import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { pointExpireAt } from '@fullyu/crm-shared';
import { PrismaService } from '../common/prisma.service';
import { badRequest, conflict, notFound, unprocessable } from '../common/errors';
import { newId } from '../common/ids';

export type AdjustmentLine = { memberId: string; points: number; note?: string };

export type ApplyMeta = {
  business: string;
  ref: string;
  operatorId: string;
  operatorName: string;
  note: string;
  idemPrefix: string;
};

/**
 * 积分账本唯一规则：
 * - 余额永远由未到期 ACTIVE 批次的 remaining 汇总，不存冗余余额字段；
 * - 扣减按到期最早优先，条件更新兜底并发，不允许负余额；
 * - 每次变动写一条只追加流水，balance_after 供每日对账校验。
 */
@Injectable()
export class PointsService {
  constructor(private readonly prisma: PrismaService) {}

  async balance(memberId: string, now = new Date()): Promise<number> {
    const sum = await this.prisma.pointBatch.aggregate({
      where: { memberId, status: 'ACTIVE', expireAt: { gt: now } },
      _sum: { remaining: true }
    });
    return sum._sum.remaining || 0;
  }

  /** 在同一事务内按行执行；任何一行失败抛错 → 整单回滚。 */
  async apply(
    tx: Prisma.TransactionClient,
    lines: AdjustmentLine[],
    meta: ApplyMeta
  ): Promise<{ memberId: string; delta: number; balance: number; ledgerId: string }[]> {
    const results: { memberId: string; delta: number; balance: number; ledgerId: string }[] = [];
    for (const [index, line] of lines.entries()) {
      if (!Number.isInteger(line.points) || line.points === 0) {
        throw badRequest('调整分值必须是非零整数');
      }
      const member = await tx.member.findUnique({ where: { id: line.memberId } });
      if (!member) throw notFound(`会员不存在：${line.memberId}`);
      if (member.status !== 'ACTIVE') {
        throw badRequest(`会员 ${member.memberNo} 不是有效状态，不能调整`);
      }
      const now = new Date();
      if (line.points < 0) await this.consume(tx, member.id, -line.points, now);
      else await this.credit(tx, member.id, line.points, now, meta.business);

      const balance = await this.balanceIn(tx, member.id, now);
      const ledger = await tx.pointLedger.create({
        data: {
          id: newId('PL'),
          memberId: member.id,
          type: 'ADJUST',
          delta: line.points,
          balanceAfter: balance,
          business: meta.business,
          ref: meta.ref,
          operatorId: meta.operatorId,
          operatorName: meta.operatorName,
          note: line.note || meta.note,
          idemKey: `${meta.idemPrefix}:${index}:${member.id}`
        }
      });
      results.push({ memberId: member.id, delta: line.points, balance, ledgerId: ledger.id });
    }
    return results;
  }

  private async balanceIn(tx: Prisma.TransactionClient, memberId: string, now: Date) {
    const sum = await tx.pointBatch.aggregate({
      where: { memberId, status: 'ACTIVE', expireAt: { gt: now } },
      _sum: { remaining: true }
    });
    return sum._sum.remaining || 0;
  }

  private async credit(
    tx: Prisma.TransactionClient,
    memberId: string,
    points: number,
    now: Date,
    business: string
  ) {
    await tx.pointBatch.create({
      data: {
        id: newId('PB'),
        memberId,
        issuerBusiness: business,
        sourceRef: '',
        amount: points,
        remaining: points,
        status: 'ACTIVE',
        earnedAt: now,
        expireAt: pointExpireAt(now)
      }
    });
  }

  private async consume(
    tx: Prisma.TransactionClient,
    memberId: string,
    points: number,
    now: Date
  ) {
    const batches = await tx.pointBatch.findMany({
      where: { memberId, status: 'ACTIVE', remaining: { gt: 0 }, expireAt: { gt: now } },
      orderBy: [{ expireAt: 'asc' }, { earnedAt: 'asc' }]
    });
    let need = points;
    for (const batch of batches) {
      if (need === 0) break;
      const take = Math.min(batch.remaining, need);
      const updated = await tx.pointBatch.updateMany({
        where: { id: batch.id, status: 'ACTIVE', remaining: { gte: take } },
        data: {
          remaining: { decrement: take },
          ...(batch.remaining - take === 0 ? { status: 'DEPLETED' } : {})
        }
      });
      if (updated.count !== 1) throw conflict('积分批次已被其他操作占用，请重试');
      need -= take;
    }
    if (need > 0) throw unprocessable('积分余额不足');
  }
}
