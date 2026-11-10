import { ACCOUNTS, createHarness, type Harness } from '../testing/harness';
import { RetreatPaymentClient } from './retreat-payment.client';

/**
 * 2026-11-09 会议：CRM 是会员资格的唯一账本。
 * 手工发卡/续费/赠送、规则/协商/同步退款、轻疗重试与解除购买锁定，全部落 CRM 流水。
 * 轻疗客户端用假实现替换，不产生任何真实网络或资金请求。
 */
describe('CRM 会员卡台账：发卡、退款、轻疗同步与解锁', () => {
  const retreat = {
    enabled: true,
    order: jest.fn(),
    refund: jest.fn(),
    retry: jest.fn(),
    unlock: jest.fn()
  };
  let h: Harness;
  let admin: string;
  let ops: string;
  let finance: string;
  let cs: string;
  let store: string;
  let seq = 0;

  beforeAll(async () => {
    h = await createHarness({
      overrides: [{ provide: RetreatPaymentClient, useValue: retreat }]
    });
    admin = await h.login(ACCOUNTS.admin);
    ops = await h.login(ACCOUNTS.ops);
    finance = await h.login(ACCOUNTS.finance);
    cs = await h.login(ACCOUNTS.cs);
    store = await h.login(ACCOUNTS.store);
    for (const [id, phone] of [
      ['m-cd-gift', '13710000001'],
      ['m-cd-man', '13710000002'],
      ['m-cd-ql', '13710000003'],
      ['m-cd-neg', '13710000004'],
      ['m-cd-sync', '13710000005'],
      ['m-cd-retry', '13710000006']
    ] as const) {
      await h.prisma.member.create({
        data: { id, memberNo: `FY-CARD-${id}`, phone, name: `台账${id}` }
      });
    }
    await h.prisma.memberIdentity.create({
      data: { id: 'id-m-cd-man', business: 'ql', localUserId: 'local-m-cd-man', memberId: 'm-cd-man' }
    });
    await h.prisma.member.create({
      data: { id: 'm-cd-nophone', memberNo: 'FY-CARD-NOPHONE', phone: null, name: '无手机号会员' }
    });
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(() => {
    retreat.enabled = true;
    retreat.order.mockReset();
    retreat.refund.mockReset();
    retreat.retry.mockReset();
    retreat.unlock.mockReset();
  });

  const orderRef = (prefix: string) => `${prefix}-${Date.now()}-${(seq += 1)}`;

  /** 直接落一张轻疗线上卡（模拟历史支付开卡），避免依赖外部接口。 */
  async function seedPaidCard(input: {
    memberId: string;
    orderRef: string;
    paidCents?: number;
    paidAt?: Date;
  }) {
    const now = new Date();
    const paidAt = input.paidAt || now;
    const id = `mbc-test-${Date.now()}-${(seq += 1)}`;
    await h.prisma.memberBrandCard.create({
      data: {
        id,
        memberId: input.memberId,
        productCode: 'FY_MONTH',
        version: 1,
        productName: 'Full愈月卡',
        priceCents: 4500,
        validDays: 30,
        validFrom: paidAt,
        validUntil: new Date(paidAt.getTime() + 29 * 86_400_000),
        state: 'ACTIVE',
        benefitsJson: '[]',
        pointsSpendJson: '{}',
        gameEnabled: true,
        soldBy: 'ql',
        soldByName: '轻疗',
        orderRef: input.orderRef,
        paidCents: input.paidCents ?? 4500,
        paidAt,
        source: 'PAID'
      }
    });
    return id;
  }

  it('台账列表：汇总、产品选项与筛选可用；门店角色无权访问', async () => {
    const first = await h.api('get', '/issued-cards', admin);
    expect(first.status).toBe(200);
    expect(first.body.items.length).toBeGreaterThan(0);
    expect(first.body.products.some((row: { code: string }) => row.code === 'FY_ANNUAL')).toBe(true);
    expect(first.body.summary.total).toBeGreaterThanOrEqual(1);
    expect(first.body.size).toBe(20);

    const filtered = await h.api('get', `/issued-cards?q=${encodeURIComponent('林小满')}`, admin);
    expect(filtered.status).toBe(200);
    expect(filtered.body.items.every((row: { member: { name: string } }) => row.member.name.includes('林小满'))).toBe(
      true
    );

    const denied = await h.api('get', '/issued-cards', store);
    expect(denied.status).toBe(403);
  });

  it('赠送发卡：不登记实收、不发券；同订单号重放返回同一张卡，换会员冲突', async () => {
    const ref = orderRef('CRM-GIFT');
    const body = { memberId: 'm-cd-gift', productCode: 'FY_MONTH', mode: 'GIFT', soldBy: 'ql', orderRef: ref };
    const created = await h.api('post', '/issued-cards', admin, body);
    expect(created.status).toBe(201);
    expect(created.body.replayed).toBe(false);
    expect(created.body.card.source).toBe('GIFT');
    expect(created.body.card.paidCents).toBe(0);
    expect(created.body.card.state).toBe('ACTIVE');
    expect(created.body.vouchers).toEqual([]);

    const replay = await h.api('post', '/issued-cards', admin, body);
    expect(replay.status).toBe(201);
    expect(replay.body.replayed).toBe(true);
    expect(replay.body.card.cardId).toBe(created.body.card.cardId);

    const clash = await h.api('post', '/issued-cards', admin, { ...body, memberId: 'm-su' });
    expect(clash.status).toBe(409);
    expect(clash.body.error).toBe('IDEMPOTENCY_CONFLICT');

    const withPaid = await h.api('post', '/issued-cards', admin, { ...body, orderRef: orderRef('CRM-GIFT-P'), paidCents: 1 });
    expect(withPaid.status).toBe(400);

    // 续费：第二张卡从上一张到期次日起算，进入待开始。
    const renew = await h.api('post', '/issued-cards', admin, {
      memberId: 'm-cd-gift',
      productCode: 'FY_MONTH',
      mode: 'GIFT',
      soldBy: 'ql',
      orderRef: orderRef('CRM-GIFT-RENEW')
    });
    expect(renew.status).toBe(201);
    expect(renew.body.card.state).toBe('PENDING');
    expect(renew.body.card.validFrom > created.body.card.validUntil).toBe(true);
  });

  it('线下收款发卡：按版本发提货券、写审计与同步队列；规则退款只记账由财务线下退回', async () => {
    const created = await h.api('post', '/issued-cards', admin, {
      memberId: 'm-cd-man',
      productCode: 'FY_ANNUAL',
      mode: 'MANUAL',
      paidCents: 29900,
      soldBy: 'ql',
      orderRef: orderRef('CRM-MAN'),
      note: '门店收银台线下购买'
    });
    expect(created.status).toBe(201);
    const cardId = created.body.card.cardId as string;
    expect(created.body.card.source).toBe('MANUAL');
    expect(created.body.card.paidCents).toBe(29900);
    expect(created.body.vouchers).toHaveLength(2);
    expect(created.body.vouchers.every((row: { status: string }) => row.status === 'ISSUED')).toBe(true);

    const auditRow = await h.prisma.auditLog.findFirst({
      where: { action: '手工发卡', target: 'FY-CARD-m-cd-man' },
      orderBy: { at: 'desc' }
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow?.detail).toContain('门店收银台线下购买');

    const outbox = await h.prisma.outboxEvent.findMany({ where: { topic: 'brand_card.issued', memberId: 'm-cd-man' } });
    expect(outbox.length).toBeGreaterThan(0);
    expect(JSON.parse(outbox[0].payloadJson).manual).toBe(true);

    const detail = await h.api('get', `/issued-cards/${cardId}`, admin);
    expect(detail.status).toBe(200);
    expect(detail.body.quote.allowed).toBe(true);
    expect(detail.body.quote.paidCents).toBe(29900);
    // 手工卡不走轻疗查询
    expect(retreat.order).not.toHaveBeenCalled();

    const refunded = await h.api('post', `/issued-cards/${cardId}/refund`, finance, { kind: 'RULE' });
    expect(refunded.status).toBe(200);
    expect(refunded.body.offline).toBe(true);
    expect(refunded.body.card.state).toBe('REFUNDED');
    expect(retreat.refund).not.toHaveBeenCalled();

    const vouchers = await h.prisma.pickupVoucher.findMany({ where: { cardId } });
    expect(vouchers.every((row) => row.status === 'VOID')).toBe(true);
    const refundAudit = await h.prisma.auditLog.findFirst({
      where: { action: '规则退款', target: 'FY-CARD-m-cd-man' },
      orderBy: { at: 'desc' }
    });
    expect(refundAudit?.detail).toContain('线下退回');

    const again = await h.api('post', `/issued-cards/${cardId}/refund`, finance, { kind: 'RULE' });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('ALREADY_REFUNDED');
  });

  it('轻疗线上卡规则退款：先调轻疗原路退回，金额以轻疗实退为准', async () => {
    const cardId = await seedPaidCard({ memberId: 'm-cd-ql', orderRef: 'QL-CARD-RULE-1', paidCents: 4500 });
    retreat.order.mockResolvedValue({ orderSn: 'QL-CARD-RULE-1', state: 1, paidCents: 4500 });
    retreat.refund.mockResolvedValue({
      orderSn: 'QL-CARD-RULE-1',
      state: 3,
      refundCents: 4500,
      refundType: 'WITHIN_7D'
    });

    const res = await h.api('post', `/issued-cards/${cardId}/refund`, finance, { kind: 'RULE' });
    expect(res.status).toBe(200);
    expect(res.body.amountMismatch).toBe(false);
    expect(retreat.refund).toHaveBeenCalledWith(
      expect.objectContaining({ orderSn: 'QL-CARD-RULE-1', refundCents: 4500, refundType: 'WITHIN_7D' })
    );

    const saved = await h.prisma.memberBrandCard.findUniqueOrThrow({ where: { id: cardId } });
    expect(saved.state).toBe('REFUNDED');
    expect(saved.refundCents).toBe(4500);
    expect(saved.refundType).toBe('WITHIN_7D');
  });

  it('协商退款：超过实付被拒绝；轻疗卡按协商金额原路退回', async () => {
    const cardId = await seedPaidCard({ memberId: 'm-cd-neg', orderRef: 'QL-CARD-NEG-1', paidCents: 4500 });
    const tooMuch = await h.api('post', `/issued-cards/${cardId}/refund`, finance, {
      kind: 'NEGOTIATED',
      refundCents: 5000,
      reason: '客户协商退款'
    });
    expect(tooMuch.status).toBe(400);

    retreat.refund.mockResolvedValue({ orderSn: 'QL-CARD-NEG-1', state: 3, refundCents: 2000, refundType: 'NEGOTIATED' });
    const res = await h.api('post', `/issued-cards/${cardId}/refund`, finance, {
      kind: 'NEGOTIATED',
      refundCents: 2000,
      reason: '客户协商一致退一半'
    });
    expect(res.status).toBe(200);
    expect(res.body.remote.refundCents).toBe(2000);
    const saved = await h.prisma.memberBrandCard.findUniqueOrThrow({ where: { id: cardId } });
    expect(saved.state).toBe('REFUNDED');
    expect(saved.refundCents).toBe(2000);
    expect(saved.refundType).toBe('NEGOTIATED');
  });

  it('同步退款：轻疗未退不能同步，已退可补记 CRM；手工卡不适用', async () => {
    const cardId = await seedPaidCard({ memberId: 'm-cd-sync', orderRef: 'QL-CARD-SYNC-1', paidCents: 4500 });
    retreat.order.mockResolvedValue({ orderSn: 'QL-CARD-SYNC-1', state: 1, refundCents: 0 });
    const early = await h.api('post', `/issued-cards/${cardId}/refund`, finance, { kind: 'SYNC' });
    expect(early.status).toBe(409);
    expect(early.body.error).toBe('RETREAT_NOT_REFUNDED');

    retreat.order.mockResolvedValue({
      orderSn: 'QL-CARD-SYNC-1',
      state: 3,
      refundCents: 4500,
      refundType: 'NEGOTIATED'
    });
    const synced = await h.api('post', `/issued-cards/${cardId}/refund`, finance, { kind: 'SYNC' });
    expect(synced.status).toBe(200);
    expect(retreat.refund).not.toHaveBeenCalled();
    const saved = await h.prisma.memberBrandCard.findUniqueOrThrow({ where: { id: cardId } });
    expect(saved.state).toBe('REFUNDED');
    expect(saved.refundCents).toBe(4500);
    expect(saved.refundType).toBe('NEGOTIATED');

    const manual = await h.api('post', '/issued-cards', admin, {
      memberId: 'm-cd-sync',
      productCode: 'FY_MONTH',
      mode: 'MANUAL',
      paidCents: 4500,
      soldBy: 'ql',
      orderRef: orderRef('CRM-MAN-SYNC')
    });
    expect(manual.status).toBe(201);
    const notApplicable = await h.api('post', `/issued-cards/${manual.body.card.cardId}/refund`, finance, {
      kind: 'SYNC'
    });
    expect(notApplicable.status).toBe(409);
    expect(notApplicable.body.error).toBe('SYNC_NOT_APPLICABLE');
  });

  it('重试开卡/撤销：只对轻疗线上卡开放并留审计', async () => {
    const cardId = await seedPaidCard({ memberId: 'm-cd-retry', orderRef: 'QL-CARD-RETRY-1', paidCents: 4500 });
    retreat.retry.mockResolvedValue({ orderSn: 'QL-CARD-RETRY-1', replayed: false });
    const res = await h.api('post', `/issued-cards/${cardId}/retry`, admin, { kind: 'SETTLE' });
    expect(res.status).toBe(200);
    expect(retreat.retry).toHaveBeenCalledWith('QL-CARD-RETRY-1', 'SETTLE');
    const auditRow = await h.prisma.auditLog.findFirst({
      where: { action: '重试开卡', target: 'QL-CARD-RETRY-1' },
      orderBy: { at: 'desc' }
    });
    expect(auditRow).not.toBeNull();

    const manual = await h.api('post', '/issued-cards', admin, {
      memberId: 'm-cd-retry',
      productCode: 'FY_MONTH',
      mode: 'GIFT',
      soldBy: 'ql',
      orderRef: orderRef('CRM-RETRY-GIFT')
    });
    const notApplicable = await h.api('post', `/issued-cards/${manual.body.card.cardId}/retry`, admin, { kind: 'SETTLE' });
    expect(notApplicable.status).toBe(409);
    expect(notApplicable.body.error).toBe('RETREAT_NOT_APPLICABLE');
  });

  it('解除购买锁定：按会员手机号调用轻疗并留审计；缺手机号拒绝', async () => {
    retreat.unlock.mockResolvedValue({ customerId: 101, wasLocked: true, unlocked: true });
    const res = await h.api('post', '/members/m-cd-man/unlock', finance, {});
    expect(res.status).toBe(200);
    expect(res.body.customerId).toBe(101);
    expect(res.body.wasLocked).toBe(true);
    expect(retreat.unlock).toHaveBeenCalledWith('13710000002');
    const auditRow = await h.prisma.auditLog.findFirst({
      where: { action: '解除品牌会员购买锁定', target: 'FY-CARD-m-cd-man' },
      orderBy: { at: 'desc' }
    });
    expect(auditRow).not.toBeNull();

    const noPhone = await h.api('post', '/members/m-cd-nophone/unlock', finance, {});
    expect(noPhone.status).toBe(400);
    expect(retreat.unlock).toHaveBeenCalledTimes(1);
  });

  it('详情：种子卡返回试算、提货码与轻疗订单快照；查询失败不阻塞页面', async () => {
    retreat.order.mockResolvedValue({
      orderSn: 'seed:annual',
      state: 1,
      paidCents: 29900,
      refundState: 'NONE',
      crmRefunded: null
    });
    const ok = await h.api('get', '/issued-cards/mbc-seed-lin', admin);
    expect(ok.status).toBe(200);
    expect(ok.body.card.cardId).toBe('mbc-seed-lin');
    expect(ok.body.quote.allowed).toBe(true);
    expect(ok.body.vouchers.length).toBeGreaterThan(0);
    expect(ok.body.retreat.order.state).toBe(1);
    expect(retreat.order).toHaveBeenCalledWith('seed:annual');

    retreat.order.mockRejectedValue(new Error('轻疗暂时不可用'));
    const degraded = await h.api('get', '/issued-cards/mbc-seed-lin', admin);
    expect(degraded.status).toBe(200);
    expect(degraded.body.retreat.error).toContain('轻疗暂时不可用');
    expect(degraded.body.quote.allowed).toBe(true);

    const missing = await h.api('get', '/issued-cards/mbc-missing', admin);
    expect(missing.status).toBe(404);
  });

  it('权限：运营不能退款、财务不能发卡、客服不能退款', async () => {
    const cardId = await seedPaidCard({ memberId: 'm-cd-ql', orderRef: orderRef('QL-PERM') });
    const opsRefund = await h.api('post', `/issued-cards/${cardId}/refund`, ops, { kind: 'RULE' });
    expect(opsRefund.status).toBe(403);

    const financeIssue = await h.api('post', '/issued-cards', finance, {
      memberId: 'm-cd-ql',
      productCode: 'FY_MONTH',
      mode: 'GIFT',
      soldBy: 'ql'
    });
    expect(financeIssue.status).toBe(403);

    const csRefund = await h.api('post', `/issued-cards/${cardId}/refund`, cs, { kind: 'RULE' });
    expect(csRefund.status).toBe(403);

    const opsIssue = await h.api('post', '/issued-cards', ops, {
      memberId: 'm-cd-ql',
      productCode: 'FY_MONTH',
      mode: 'GIFT',
      soldBy: 'ql',
      orderRef: orderRef('OPS-ISSUE')
    });
    expect(opsIssue.status).toBe(201);
  });
});
