import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { badRequest } from '../common/errors';
import { phoneSearchTerms } from '../common/phone';

export const LEDGER_TYPES = [
  'EARN',
  'CONSUME',
  'REFUND',
  'REVOKE',
  'EXPIRE',
  'ADJUST',
  'MIGRATE'
] as const;

export type LedgerQuery = {
  memberId?: string;
  q?: string;
  type?: string;
  business?: string;
  ref?: string;
  from?: string;
  to?: string;
  page?: number | string;
  size?: number | string;
};

const MAX_SIZE = 200;
const DEFAULT_SIZE = 50;
const MAX_MEMBER_MATCHES = 500;

/** 积分流水只读查询：会员详情只给最近 20 条，全量对账走这里。 */
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async query(input: LedgerQuery) {
    const page = Math.max(1, toInt(input.page, 1));
    const size = Math.min(MAX_SIZE, Math.max(1, toInt(input.size, DEFAULT_SIZE)));
    const where: Prisma.PointLedgerWhereInput = {};

    if (input.memberId) where.memberId = input.memberId;

    const q = (input.q || '').trim();
    if (q) {
      const members = await this.prisma.member.findMany({
        where: {
          OR: [
            { memberNo: { contains: q } },
            ...phoneSearchTerms(q).map((phone) => ({ phone: { contains: phone } })),
            { name: { contains: q } }
          ]
        },
        select: { id: true },
        take: MAX_MEMBER_MATCHES
      });
      if (!members.length) {
        return {
          rows: [],
          page,
          size,
          total: 0,
          summary: { count: 0, plus: 0, minus: 0 }
        };
      }
      where.memberId = { in: members.map((member) => member.id) };
    }

    if (input.type) {
      if (!LEDGER_TYPES.includes(input.type as never)) throw badRequest('未知的积分流水类型');
      where.type = input.type;
    }
    if (input.business) where.business = input.business;
    const ref = (input.ref || '').trim();
    if (ref) where.ref = { contains: ref };

    const createdAt = parseRange(input.from, input.to);
    if (createdAt) where.createdAt = createdAt;

    const [total, plus, minus, rows] = await this.prisma.$transaction([
      this.prisma.pointLedger.count({ where }),
      this.prisma.pointLedger.aggregate({ where: { ...where, delta: { gt: 0 } }, _sum: { delta: true } }),
      this.prisma.pointLedger.aggregate({ where: { ...where, delta: { lt: 0 } }, _sum: { delta: true } }),
      this.prisma.pointLedger.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * size,
        take: size,
        include: { member: { select: { memberNo: true, name: true, phone: true } } }
      })
    ]);

    return {
      rows: rows.map((row) => ({
        id: row.id,
        memberId: row.memberId,
        memberNo: row.member.memberNo,
        memberName: row.member.name,
        phone: row.member.phone,
        type: row.type,
        delta: row.delta,
        balanceAfter: row.balanceAfter,
        business: row.business,
        ref: row.ref,
        note: row.note,
        operatorId: row.operatorId,
        operatorName: row.operatorName,
        createdAt: row.createdAt.toISOString()
      })),
      page,
      size,
      total,
      summary: {
        count: total,
        plus: plus._sum.delta || 0,
        minus: minus._sum.delta || 0
      }
    };
  }
}

function toInt(value: number | string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

/** 日期边界按上海时区自然日；to 含当天。 */
function parseRange(from?: string, to?: string): Prisma.DateTimeFilter | null {
  const start = parseDay(from);
  const end = parseDay(to);
  if (!from && !to) return null;
  if ((from && !start) || (to && !end)) throw badRequest('日期格式应为 YYYY-MM-DD');
  const filter: Prisma.DateTimeFilter = {};
  if (start) filter.gte = start;
  if (end) filter.lt = new Date(end.getTime() + 86400_000);
  return filter;
}

function parseDay(value?: string): Date | null {
  const text = (value || '').trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}
