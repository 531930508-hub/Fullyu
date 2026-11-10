import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { businessName, toExternalBusiness } from '@fullyu/crm-shared';
import { PrismaService } from '../common/prisma.service';
import { badRequest, conflict, notFound } from '../common/errors';
import { audit } from '../common/audit';
import { GameService } from '../game/game.service';
import type { StaffContext } from '../common/auth.types';
import { phoneSearchTerms } from '../common/phone';

const parseJson = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly game: GameService
  ) {}

  async list(query: { q?: string; business?: string }) {
    const q = (query.q || '').trim();
    const where: Prisma.MemberWhereInput = { status: { not: 'MERGED' } };
    if (q) {
      where.OR = [
        { memberNo: { contains: q } },
        ...phoneSearchTerms(q).map((phone) => ({ phone: { contains: phone } })),
        { name: { contains: q } }
      ];
    }
    if (query.business) where.identities = { some: { business: query.business } };
    const rows = await this.prisma.member.findMany({
      where,
      orderBy: { memberNo: 'desc' },
      take: 50,
      include: { identities: true }
    });
    const sums = await this.prisma.pointBatch.groupBy({
      by: ['memberId'],
      where: {
        memberId: { in: rows.map((row) => row.id) },
        status: 'ACTIVE',
        expireAt: { gt: new Date() }
      },
      _sum: { remaining: true }
    });
    const balance = new Map(sums.map((sum) => [sum.memberId, sum._sum.remaining || 0]));
    return rows.map((row) => ({
      id: row.id,
      memberNo: row.memberNo,
      name: row.name,
      phone: row.phone,
      gender: row.gender,
      birthday: row.birthday,
      status: row.status,
      profileVersion: row.profileVersion,
      identities: row.identities.map((identity) => ({
        business: identity.business,
        localUserId: identity.localUserId
      })),
      balance: balance.get(row.id) || 0
    }));
  }

  async detail(id: string, actor: StaffContext) {
    const row = await this.prisma.member.findUnique({
      where: { id },
      include: { identities: true }
    });
    if (!row) throw notFound('会员不存在');
    await this.logView(actor, row.memberNo);

    const now = new Date();
    const [sums, ledger, batches, cards, game] = await Promise.all([
      this.prisma.pointBatch.aggregate({
        where: { memberId: id, status: 'ACTIVE', expireAt: { gt: now } },
        _sum: { remaining: true }
      }),
      this.prisma.pointLedger.findMany({
        where: { memberId: id },
        orderBy: { createdAt: 'desc' },
        take: 20
      }),
      this.prisma.pointBatch.findMany({
        where: { memberId: id, status: 'ACTIVE', remaining: { gt: 0 }, expireAt: { gt: now } },
        orderBy: { expireAt: 'asc' },
        take: 10
      }),
      this.prisma.memberBrandCard.findMany({
        where: { memberId: id },
        orderBy: [{ validUntil: 'desc' }, { paidAt: 'desc' }]
      }),
      this.game.summaryForMember(id)
    ]);

    return {
      member: row,
      identities: row.identities,
      balance: sums._sum.remaining || 0,
      expiringSoon: batches.filter((batch) => batch.expireAt.getTime() - now.getTime() <= 30 * 86400_000),
      batches,
      ledger,
      brandCards: cards.map((card) => {
        let effectiveState = card.state;
        if (card.state === 'ACTIVE') {
          if (card.validUntil.getTime() < now.getTime()) effectiveState = 'EXPIRED';
          else if (card.validUntil.getTime() - now.getTime() <= 30 * 86400_000) {
            effectiveState = 'EXPIRING';
          } else effectiveState = 'ACTIVE';
        }
        return {
          cardId: card.id,
          productCode: card.productCode,
          productName: card.productName,
          version: card.version,
          state: card.state,
          effectiveState,
          validFrom: card.validFrom.toISOString(),
          validUntil: card.validUntil.toISOString(),
          priceCents: card.priceCents,
          paidCents: card.paidCents,
          paidAt: card.paidAt.toISOString(),
          gameEnabled: card.gameEnabled,
          benefits: parseJson(card.benefitsJson, []),
          pointsSpend: parseJson(card.pointsSpendJson, {}),
          business: toExternalBusiness(card.soldBy) || card.soldBy,
          businessName: businessName(card.soldBy),
          soldByName: card.soldByName
        };
      }),
      game: {
        dice: game.balance,
        station: game.station,
        lap: game.lap,
        monthlyEarned: game.monthlyEarned,
        pendingPrizes: game.pendingPrizes
      }
    };
  }

  /** 档案查看审计：同一操作人 + 同一会员当天只记一次；跨天再记。 */
  private async logView(actor: StaffContext, memberNo: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const exists = await this.prisma.auditLog.findFirst({
      where: { actorId: actor.id, action: '查看会员档案', target: memberNo, at: { gte: start } }
    });
    if (!exists) {
      await audit(this.prisma, { actor, action: '查看会员档案', target: memberNo });
    }
  }

  async updateProfile(
    id: string,
    input: {
      baseVersion: number;
      name?: string;
      gender?: number | null;
      birthday?: string | null;
      avatarUrl?: string | null;
    },
    actor: StaffContext
  ) {
    const row = await this.prisma.member.findUnique({ where: { id } });
    if (!row) throw notFound('会员不存在');
    if (!Number.isInteger(input.baseVersion)) throw badRequest('缺少资料版本');
    if (row.profileVersion !== input.baseVersion) {
      throw conflict('资料已被其他人修改，请刷新后重试');
    }
    const data: Prisma.MemberUpdateInput = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name.length < 1 || name.length > 20) throw badRequest('姓名须为 1–20 个字符');
      data.name = name;
    }
    if (input.gender !== undefined) {
      if (input.gender !== null && input.gender !== 1 && input.gender !== 2) {
        throw badRequest('性别只能是 1、2 或空');
      }
      data.gender = input.gender;
    }
    if (input.birthday !== undefined) {
      if (input.birthday === null) {
        data.birthday = null;
      } else {
        const date = new Date(`${input.birthday}T00:00:00+08:00`);
        if (Number.isNaN(date.getTime())) throw badRequest('生日格式应为 YYYY-MM-DD');
        if (date.getTime() > Date.now()) throw badRequest('生日不能晚于今天');
        data.birthday = date;
      }
    }
    if (input.avatarUrl !== undefined) {
      if (input.avatarUrl && !/^https?:\/\//.test(input.avatarUrl)) {
        throw badRequest('头像地址必须是 http(s) URL');
      }
      data.avatarUrl = input.avatarUrl || null;
    }
    if (!Object.keys(data).length) throw badRequest('没有需要修改的字段');

    const updated = await this.prisma.member.update({
      where: { id },
      data: { ...data, profileVersion: { increment: 1 } }
    });
    await audit(this.prisma, {
      actor,
      action: '修改会员资料',
      target: row.memberNo,
      detail: `v${row.profileVersion}→v${updated.profileVersion}`
    });
    return updated;
  }
}
