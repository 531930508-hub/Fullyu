import { Injectable } from '@nestjs/common';
import {
  BUSINESSES,
  toExternalBusiness
} from '@fullyu/crm-shared';
import { PrismaService } from '../common/prisma.service';
import { badRequest } from '../common/errors';

const TZ_MS = 8 * 60 * 60 * 1000;

const emptyBusinessMap = (): Record<string, number> =>
  Object.fromEntries(BUSINESSES.map((item) => [toExternalBusiness(item.key)!, 0]));

/**
 * 月度对账只出事实数据：年卡按售卖业务、积分按发行/消耗业务、骰子按发放/消耗。
 * 系统不生成结算凭证，不推断分摊比例；业务核销明细未接入时省下金额返回 0。
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async monthly(month?: string) {
    const range = this.monthRange(month);
    const cards = await this.prisma.memberBrandCard.findMany({
      where: { paidAt: { gte: range.from, lt: range.to } },
      select: { soldBy: true, paidCents: true, state: true }
    });
    const sold: Record<string, { count: number; grossCents: number }> = {};
    const refunded: Record<string, number> = {};
    for (const item of BUSINESSES) {
      const key = toExternalBusiness(item.key)!;
      sold[key] = { count: 0, grossCents: 0 };
      refunded[key] = 0;
    }
    for (const card of cards) {
      const key = toExternalBusiness(card.soldBy) || card.soldBy;
      sold[key] ||= { count: 0, grossCents: 0 };
      sold[key].count += 1;
      sold[key].grossCents += card.paidCents;
      if (card.state === 'REFUNDED') refunded[key] = (refunded[key] || 0) + 1;
    }
    const total = {
      count: cards.length,
      grossCents: cards.reduce((sum, card) => sum + card.paidCents, 0)
    };

    const batches = await this.prisma.pointBatch.findMany({
      where: { earnedAt: { gte: range.from, lt: range.to }, amount: { gt: 0 } },
      select: { issuerBusiness: true, amount: true }
    });
    const issued = emptyBusinessMap();
    for (const batch of batches) {
      const key = toExternalBusiness(batch.issuerBusiness) || batch.issuerBusiness;
      issued[key] = (issued[key] || 0) + batch.amount;
    }

    const pointRows = await this.prisma.pointLedger.findMany({
      where: {
        createdAt: { gte: range.from, lt: range.to },
        delta: { lt: 0 },
        type: { in: ['CONSUME', 'ADJUST', 'REVOKE', 'EXPIRE'] }
      },
      select: { type: true, delta: true, business: true }
    });
    const consumed = emptyBusinessMap();
    const adjusted = emptyBusinessMap();
    for (const row of pointRows) {
      const key = toExternalBusiness(row.business) || row.business || 'unknown';
      if (row.type === 'CONSUME') {
        consumed[key] = (consumed[key] || 0) + Math.abs(row.delta);
      } else if (row.type === 'ADJUST') {
        adjusted[key] = (adjusted[key] || 0) + Math.abs(row.delta);
      }
    }

    const diceRows = await this.prisma.diceLedger.findMany({
      where: { createdAt: { gte: range.from, lt: range.to } },
      select: { kind: true, delta: true, business: true }
    });
    const diceIssued = emptyBusinessMap();
    let rolled = 0;
    let refundedDice = 0;
    for (const row of diceRows) {
      const key = toExternalBusiness(row.business) || row.business || 'unknown';
      if (row.kind === 'EARN_ORDER' || row.kind === 'EARN_CHECKIN') {
        diceIssued[key] = (diceIssued[key] || 0) + Math.max(0, row.delta);
      } else if (row.kind === 'ROLL') {
        rolled += Math.abs(row.delta);
      } else if (row.kind === 'REFUND') {
        refundedDice += Math.abs(row.delta);
      }
    }

    return {
      month: range.month,
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      cards: { sold, refunded, total },
      points: { issued, consumed, adjusted },
      dice: { issued: diceIssued, rolled, refunded: refundedDice },
      savedCents: 0,
      usageNote: '业务核销明细未接入，年卡已享优惠暂不统计；本报表仅为事实数据，不生成结算凭证',
      factsOnly: true,
      generatedAt: new Date().toISOString()
    };
  }

  private monthRange(month?: string): {
    month: string;
    from: Date;
    to: Date;
  } {
    const text =
      typeof month === 'string' && month.trim()
        ? month.trim()
        : new Date(Date.now() + TZ_MS).toISOString().slice(0, 7);
    const matched = /^(\d{4})-(\d{2})$/.exec(text);
    if (!matched) throw badRequest('month 格式必须是 YYYY-MM');
    const year = Number(matched[1]);
    const monthIndex = Number(matched[2]) - 1;
    if (monthIndex < 0 || monthIndex > 11) throw badRequest('month 月份必须在 01–12');
    const from = new Date(Date.UTC(year, monthIndex, 1) - TZ_MS);
    const to = new Date(Date.UTC(year, monthIndex + 1, 1) - TZ_MS);
    return { month: text, from, to };
  }
}
