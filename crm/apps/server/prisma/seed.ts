/**
 * CRM 本地初始化：四个内置角色、四个后台账号、三位合成会员。
 * 密码只用于本地开发与测试，由 SEED_PASSWORD 提供；不得写入任何真实凭据。
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { CRM_ROLE_TEMPLATES, DEFAULT_DICE_RULE, DEFAULT_POINTS_RULES, pointExpireAt } from '@fullyu/crm-shared';
import { loadLocalEnv } from '../src/env';

loadLocalEnv();

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD || 'crm-dev-2026';

const ACCOUNTS = [
  { id: 'u-admin', name: '周岚', username: '13800001001', role: 'crm-admin' },
  { id: 'u-ops', name: '李沐', username: '13800001002', role: 'crm-ops' },
  { id: 'u-fin', name: '王宁', username: '13800001003', role: 'crm-finance' },
  { id: 'u-cs', name: '赵一', username: '13800001004', role: 'crm-cs' },
  { id: 'u-store', name: '陈禾', username: '13800001005', role: 'crm-store' }
];

const MEMBERS = [
  {
    id: 'm-lin',
    memberNo: 'FY-2602-008812',
    phone: '13812346620',
    name: '林小满',
    gender: 2,
    birthday: '1994-05-18',
    points: 500,
    biz: 'sx'
  },
  {
    id: 'm-su',
    memberNo: 'FY-2607-001204',
    phone: '13620932093',
    name: '苏晚',
    gender: 2,
    birthday: '1991-09-02',
    points: 1200,
    biz: 'zc'
  },
  {
    id: 'm-tang',
    memberNo: 'FY-2605-000927',
    phone: '13900210021',
    name: '唐果',
    gender: null,
    birthday: '1998-11-21',
    points: 0,
    biz: 'ql'
  }
] as const;

async function main() {
  await prisma.memberInvite.deleteMany();
  await prisma.feedbackStory.deleteMany();
  await prisma.memberFeedback.deleteMany();
  await prisma.giftClaim.deleteMany();
  await prisma.giftCampaign.deleteMany();
  await prisma.pickupVoucher.deleteMany();
  await prisma.memberOrder.deleteMany();
  await prisma.outboxEvent.deleteMany();
  await prisma.businessSyncState.deleteMany();
  await prisma.gamePrize.deleteMany();
  await prisma.gameRoll.deleteMany();
  await prisma.diceLedger.deleteMany();
  await prisma.ruleSetVersion.deleteMany();
  await prisma.gameTicket.deleteMany();
  await prisma.memberGameState.deleteMany();
  await prisma.brandCardQuote.deleteMany();
  await prisma.memberBrandCard.deleteMany();
  await prisma.apiNonce.deleteMany();
  await prisma.idempotencyKey.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.adjustmentRequest.deleteMany();
  await prisma.pointLedger.deleteMany();
  await prisma.pointBatch.deleteMany();
  await prisma.memberIdentity.deleteMany();
  await prisma.member.deleteMany();
  await prisma.brandCardVersion.deleteMany();
  await prisma.brandCardProduct.deleteMany();
  await prisma.businessCardCatalog.deleteMany();
  await prisma.staffRole.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.crmRole.deleteMany();
  await prisma.counter.deleteMany();

  for (const t of CRM_ROLE_TEMPLATES) {
    await prisma.crmRole.create({
      data: { id: t.id, name: t.name, builtin: true, permsJson: JSON.stringify(t.perms) }
    });
  }

  const hash = bcrypt.hashSync(PASSWORD, 10);
  for (const a of ACCOUNTS) {
    await prisma.staff.create({
      data: { id: a.id, name: a.name, username: a.username, passwordHash: hash }
    });
    await prisma.staffRole.create({ data: { staffId: a.id, roleId: a.role } });
  }

  const now = new Date();

  // 1D：积分按业务、骰子全业务通用；现行版本生效日早于今天，历史只读。
  const pointsSince: Record<string, Date> = {
    sx: new Date('2026-02-01T00:00:00+08:00'),
    ql: new Date('2026-03-01T00:00:00+08:00'),
    zc: new Date('2025-12-01T00:00:00+08:00')
  };
  let ruleSeq = 0;
  for (const business of ['sx', 'ql', 'zc'] as const) {
    await prisma.ruleSetVersion.create({
      data: {
        id: `rv-seed-points-${business}-${++ruleSeq}`,
        ruleKey: 'points',
        scope: business,
        version: 1,
        status: 'CURRENT',
        effectiveFrom: pointsSince[business],
        rulesJson: JSON.stringify(DEFAULT_POINTS_RULES[business]),
        reason: '初始版本（合成数据）',
        createdBy: 'u-ops',
        createdByName: '李沐'
      }
    });
  }
  await prisma.ruleSetVersion.create({
    data: {
      id: 'rv-seed-dice-1',
      ruleKey: 'dice',
      scope: 'all',
      version: 1,
      status: 'CURRENT',
      effectiveFrom: new Date('2026-10-01T00:00:00+08:00'),
      rulesJson: JSON.stringify(DEFAULT_DICE_RULE),
      reason: '初始版本（数值待经营确认）',
      createdBy: 'u-admin',
      createdByName: '周岚'
    }
  });

  for (const m of MEMBERS) {
    await prisma.member.create({
      data: {
        id: m.id,
        memberNo: m.memberNo,
        phone: m.phone,
        name: m.name,
        gender: m.gender,
        birthday: new Date(`${m.birthday}T00:00:00+08:00`)
      }
    });
    await prisma.memberIdentity.create({
      data: { id: `id-${m.id}`, business: m.biz, localUserId: `local-${m.id}`, memberId: m.id }
    });
    if (m.points > 0) {
      await prisma.pointBatch.create({
        data: {
          id: `b-${m.id}`,
          memberId: m.id,
          issuerBusiness: m.biz,
          sourceRef: `seed:${m.id}`,
          amount: m.points,
          remaining: m.points,
          status: 'ACTIVE',
          earnedAt: now,
          expireAt: pointExpireAt(now)
        }
      });
      await prisma.pointLedger.create({
        data: {
          id: `l-${m.id}`,
          memberId: m.id,
          type: 'MIGRATE',
          delta: m.points,
          balanceAfter: m.points,
          business: m.biz,
          ref: `seed:${m.id}`,
          note: '初始化合成数据'
        }
      });
    }
  }
  const brandProducts = [
    {
      code: 'FY_MONTH',
      name: 'Full愈月卡',
      sort: 1,
      priceCents: 4500,
      validDays: 30,
      gameEnabled: true,
      gifts: [] as { title: string; desc: string; valueCents: number }[],
      benefits: [
        { business: 'ql', title: '轻疗 · 项目会员价', desc: '提前一天预约享会员价，当日预约另有会员价' },
        { business: 'sx', title: '时叙 · 会员茶饮权益', desc: '会员专属茶饮权益，具体内容以门店公示为准' },
        { business: 'zc', title: '在场 · 优先排位与阶梯价', desc: '热门课程优先排位，课程按会员阶梯价；畅练卡有效时仍按畅练卡免费' }
      ]
    },
    {
      code: 'FY_ANNUAL',
      name: 'Full愈年卡',
      sort: 2,
      priceCents: 29900,
      validDays: 365,
      gameEnabled: true,
      // 年卡实物礼：付费开卡后发提货券，任意门店人工核销（内容为占位，经营确认后在后台改版本）
      gifts: [
        { title: '时叙 · 茶礼一份', desc: '凭券到任意门店领取', valueCents: 6800 },
        { title: '轻疗 · 10ml 舒缓精油', desc: '凭券到任意门店领取', valueCents: 5800 }
      ],
      benefits: [
        { business: 'ql', title: '轻疗 · 项目会员价', desc: '提前一天预约享会员价，当日预约另有会员价' },
        { business: 'sx', title: '时叙 · 会员茶饮权益', desc: '会员专属茶饮权益，具体内容以门店公示为准' },
        { business: 'zc', title: '在场 · 优先排位与阶梯价', desc: '热门课程优先排位，课程按会员阶梯价；畅练卡有效时仍按畅练卡免费' }
      ]
    }
  ] as const;

  for (const p of brandProducts) {
    await prisma.brandCardProduct.create({
      data: {
        code: p.code,
        name: p.name,
        sort: p.sort,
        currentVersion: 1,
        versions: {
          create: {
            id: `bcv-${p.code.toLowerCase()}-v1`,
            version: 1,
            status: 'ACTIVE',
            priceCents: p.priceCents,
            validDays: p.validDays,
            benefitsJson: JSON.stringify(p.benefits),
            pointsSpendJson: JSON.stringify({
              sx: 'display_only',
              ql: '1_point_1_yuan',
              zc: 'display_only'
            }),
            gameEnabled: p.gameEnabled,
            giftsJson: JSON.stringify(p.gifts),
            perksJson: JSON.stringify({
              presence: { prioritySeat: true, tierPrice: true, invitesPerMonth: 1 }
            }),
            note: '初始化版本',
            createdBy: 'u-admin',
            createdByName: '周岚',
            activatedAt: now
          }
        }
      }
    });
  }

  const businessCards = [
    {
      id: 'bcc-zc-presence-pass',
      business: 'zc',
      cardCode: 'PRESENCE_PASS',
      name: '在场畅练卡',
      benefit: '有效期内课程免费',
      description: '在场自有卡期，CRM 只读展示，不修改有效期与核销。',
      sourceSystem: 'presence',
      managePath: '/pages/member/index',
      sort: 1
    },
    {
      id: 'bcc-ql-legacy-card',
      business: 'ql',
      cardCode: 'RETREAT_LEGACY_CARD',
      name: '轻疗历史年卡',
      benefit: '历史卡到期前继续有效，续费走 Full愈年卡',
      description: '轻疗旧卡升级为品牌卡后的只读目录项，不在 CRM 单独售卖。',
      sourceSystem: 'retreat',
      managePath: '/pages/user/member-card/member-card',
      sort: 2
    }
  ] as const;

  for (const card of businessCards) {
    await prisma.businessCardCatalog.create({ data: card });
  }

  // 1C：给林小满一张生效中的年卡与骰子进度，供三端联调读取真实卡期。
  const annualVersion = await prisma.brandCardVersion.findUniqueOrThrow({
    where: { productCode_version: { productCode: 'FY_ANNUAL', version: 1 } }
  });
  const today = shanghaiDayStart(now);
  const validFrom = addDays(today, -9);
  const validUntil = addDays(validFrom, annualVersion.validDays - 1);
  await prisma.memberBrandCard.create({
    data: {
      id: 'mbc-seed-lin',
      memberId: 'm-lin',
      productCode: 'FY_ANNUAL',
      version: 1,
      productName: 'Full愈年卡',
      priceCents: annualVersion.priceCents,
      validDays: annualVersion.validDays,
      validFrom,
      validUntil,
      state: 'ACTIVE',
      benefitsJson: annualVersion.benefitsJson,
      pointsSpendJson: annualVersion.pointsSpendJson,
      gameEnabled: annualVersion.gameEnabled,
      soldBy: 'ql',
      soldByName: '轻疗',
      orderRef: 'seed:annual',
      paidCents: annualVersion.priceCents,
      paidAt: validFrom,
      source: 'PAID',
      perksJson: annualVersion.perksJson
    }
  });
  // 年卡实物礼券：一张已核销、一张待领取，供后台核销页联调。
  await prisma.pickupVoucher.create({
    data: {
      id: 'pv-seed-lin-1',
      code: 'FYG8K2QM',
      memberId: 'm-lin',
      cardId: 'mbc-seed-lin',
      title: '时叙 · 茶礼一份',
      desc: '凭券到任意门店领取',
      valueCents: 6800,
      status: 'ISSUED',
      issuedAt: validFrom
    }
  });
  // 会员消费账本（实付已扣除全部优惠；savedCents 为会员卡带来的节省）。
  const orders = [
    { business: 'ql', orderRef: 'seed-ql-1', paidCents: 39800, savedCents: 6000, daysAgo: 8 },
    { business: 'sx', orderRef: 'seed-sx-1', paidCents: 3800, savedCents: 0, daysAgo: 5 },
    { business: 'zc', orderRef: 'seed-zc-1', paidCents: 9900, savedCents: 2000, daysAgo: 3 }
  ];
  for (const order of orders) {
    await prisma.memberOrder.create({
      data: {
        id: `mo-seed-${order.orderRef}`,
        memberId: 'm-lin',
        business: order.business,
        orderRef: order.orderRef,
        kind: 'ORDER',
        paidCents: order.paidCents,
        savedCents: order.savedCents,
        cardId: 'mbc-seed-lin',
        occurredAt: addDays(now, -order.daysAgo)
      }
    });
  }
  await prisma.giftCampaign.create({
    data: {
      id: 'gc-seed-1',
      code: 'FYTEA30',
      name: '门店体验赠送',
      channelTag: '门店地推',
      referrerType: 'STAFF',
      referrerName: '时叙店长',
      days: 30,
      quota: 100,
      claimDeadline: addDays(today, 60),
      status: 'ACTIVE',
      createdBy: 'u-ops',
      createdByName: '李沐'
    }
  });
  await prisma.memberFeedback.create({
    data: {
      id: 'fb-seed-1',
      memberId: 'm-lin',
      business: 'ql',
      content: '希望晚上能多开一个预约时段，下班过来常常约不上。',
      allowQuote: true,
      status: 'READ',
      staffNote: '已与门店确认，周三周五加开 21:00 场'
    }
  });
  await prisma.feedbackStory.create({
    data: {
      id: 'fs-seed-1',
      feedbackId: 'fb-seed-1',
      business: 'ql',
      title: '为下班后的你，多留一盏灯',
      quote: '下班过来常常约不上。',
      quoteBy: '林女士',
      story: '我们和门店的疗愈师一起排了班，从本月起周三、周五加开 21:00 的预约时段。',
      status: 'PUBLISHED',
      sort: 1,
      publishedAt: now,
      createdBy: 'u-ops',
      createdByName: '李沐'
    }
  });
  await prisma.memberGameState.create({
    data: {
      memberId: 'm-lin',
      diceBalance: 12,
      station: 8,
      monthlyEarned: 12,
      monthKey: shanghaiMonthKey(now),
      spendCarryCents: 12000
    }
  });

  console.log(
    `seeded ${CRM_ROLE_TEMPLATES.length} roles, ${ACCOUNTS.length} staff, ${MEMBERS.length} members, ` +
      `${brandProducts.length} brand products, ${businessCards.length} business cards, ` +
      `1 active brand card`
  );
}

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

function shanghaiDayStart(at: Date): Date {
  const local = new Date(at.getTime() + SHANGHAI_OFFSET_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - SHANGHAI_OFFSET_MS
  );
}

function addDays(at: Date, days: number): Date {
  return new Date(at.getTime() + days * 86400000);
}

function shanghaiMonthKey(at: Date): string {
  const local = new Date(at.getTime() + SHANGHAI_OFFSET_MS);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
