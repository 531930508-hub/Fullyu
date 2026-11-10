import { ACCOUNTS, createHarness, type Harness } from '../testing/harness';

describe('CRM 1D：月度对账只出事实数据', () => {
  let h: Harness;
  let finance: string;
  let cs: string;

  beforeAll(async () => {
    h = await createHarness();
    finance = await h.login(ACCOUNTS.finance);
    cs = await h.login(ACCOUNTS.cs);
  });

  afterAll(async () => {
    await h.close();
  });

  const month = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 7);

  it('按售卖业务统计年卡、按发行/消耗业务统计积分与骰子', async () => {
    const now = new Date();
    const at = new Date(now.getTime() - 3600000);
    await h.prisma.memberBrandCard.createMany({
      data: [
        {
          id: 'mbc-report-sx',
          memberId: 'm-su',
          productCode: 'FY_ANNUAL',
          version: 1,
          productName: 'Full愈年卡',
          priceCents: 29900,
          validDays: 365,
          validFrom: at,
          validUntil: new Date(at.getTime() + 364 * 86400000),
          state: 'ACTIVE',
          soldBy: 'sx',
          soldByName: '时叙',
          orderRef: 'TH-REPORT-CARD-1',
          paidCents: 29900,
          paidAt: at
        },
        {
          id: 'mbc-report-zc',
          memberId: 'm-lin',
          productCode: 'FY_MONTH',
          version: 1,
          productName: 'Full愈月卡',
          priceCents: 4500,
          validDays: 30,
          validFrom: at,
          validUntil: new Date(at.getTime() + 29 * 86400000),
          state: 'REFUNDED',
          soldBy: 'zc',
          soldByName: '在场',
          orderRef: 'ZC-REPORT-CARD-1',
          paidCents: 4500,
          paidAt: at
        }
      ]
    });
    await h.prisma.pointLedger.create({
      data: {
        id: 'pl-report-1',
        memberId: 'm-lin',
        type: 'CONSUME',
        delta: -100,
        balanceAfter: 400,
        business: 'ql',
        ref: 'QL-REPORT-1',
        note: '报表用例',
        createdAt: at
      }
    });
    await h.prisma.diceLedger.createMany({
      data: [
        {
          id: 'dl-report-1',
          memberId: 'm-lin',
          business: 'sx',
          kind: 'EARN_ORDER',
          ref: 'TH-REPORT-1',
          delta: 3,
          balanceAfter: 3,
          createdAt: at
        },
        {
          id: 'dl-report-2',
          memberId: 'm-lin',
          business: 'sx',
          kind: 'ROLL',
          ref: 'GR-REPORT-1',
          delta: -1,
          balanceAfter: 2,
          createdAt: at
        }
      ]
    });

    const res = await h.api('get', `/reports/monthly?month=${month}`, finance);
    expect(res.status).toBe(200);
    expect(res.body.month).toBe(month);
    expect(res.body.factsOnly).toBe(true);
    expect(res.body.cards.sold.teahour.count).toBe(1);
    expect(res.body.cards.sold.teahour.grossCents).toBe(29900);
    expect(res.body.cards.sold.retreat.count).toBe(0);
    expect(res.body.cards.sold.presence.count).toBe(1);
    expect(res.body.cards.refunded.presence).toBe(1);
    expect(res.body.cards.total.count).toBe(2);
    expect(res.body.points.issued.teahour).toBe(500);
    expect(res.body.points.issued.presence).toBe(1200);
    expect(res.body.points.consumed.retreat).toBe(100);
    expect(res.body.dice.issued.teahour).toBe(3);
    expect(res.body.dice.rolled).toBe(1);
    expect(res.body.savedCents).toBe(0);
    expect(res.body.usageNote).toContain('未接入');
  });

  it('历史月份排除本月数据；非法月份与无权限被拒', async () => {
    const old = await h.api('get', '/reports/monthly?month=2026-01', finance);
    expect(old.status).toBe(200);
    expect(old.body.cards.sold.teahour.count).toBe(0);

    const invalid = await h.api('get', '/reports/monthly?month=2026-13', finance);
    expect(invalid.status).toBe(400);

    const denied = await h.api('get', `/reports/monthly?month=${month}`, cs);
    expect(denied.status).toBe(403);
  });
});
