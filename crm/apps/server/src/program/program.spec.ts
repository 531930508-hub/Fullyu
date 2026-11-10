import { createHash, createHmac } from 'node:crypto';
import request from 'supertest';
import { ACCOUNTS, createHarness, type Harness } from '../testing/harness';

/**
 * 2026-11-08 会议落地：订单上报与节省账本、赠送会员码、提货券核销、
 * 意见反馈与会员故事、在场畅练卡附赠会员与邀请好友。
 */
const SECRETS = {
  'ql-test': { business: 'ql', secret: 'ql-secret-for-jest-0001' },
  'sx-test': { business: 'sx', secret: 'sx-secret-for-jest-0002' },
  'zc-test': { business: 'zc', secret: 'zc-secret-for-jest-0003' }
} as const;

type KeyName = keyof typeof SECRETS;

process.env.CRM_EXT_KEYS = JSON.stringify(SECRETS);
process.env.CRM_GAME_URL = 'https://game.test/play';

const signFy = (secret: string, ts: string, nonce: string, method: string, url: string, raw: string) =>
  createHmac('sha256', secret)
    .update(
      `${ts}\n${nonce}\n${method.toUpperCase()}\n${url}\n${createHash('sha256').update(raw, 'utf8').digest('hex')}`,
      'utf8'
    )
    .digest('hex');

describe('会员运营：订单账本、会员码、提货券、反馈故事、在场附赠与邀请', () => {
  let h: Harness;
  let admin: string;
  let ops: string;
  let finance: string;
  let cs: string;
  let store: string;
  let seq = 0;

  beforeAll(async () => {
    h = await createHarness();
    admin = await h.login(ACCOUNTS.admin);
    ops = await h.login(ACCOUNTS.ops);
    finance = await h.login(ACCOUNTS.finance);
    cs = await h.login(ACCOUNTS.cs);
    store = await h.login(ACCOUNTS.store);
    // 额外的合成会员：在场新用户（被邀请人）与时叙新用户（领会员码）。
    for (const [id, phone, biz] of [
      ['m-zc-new', '13700000001', 'zc'],
      ['m-zc-new2', '13700000002', 'zc'],
      ['m-sx-new', '13700000003', 'sx'],
      ['m-sx-new2', '13700000004', 'sx']
    ] as const) {
      await h.prisma.member.create({
        data: { id, memberNo: `FY-TEST-${id}`, phone, name: `测试${id}` }
      });
      await h.prisma.memberIdentity.create({
        data: { id: `id-${id}`, business: biz, localUserId: `local-${id}`, memberId: id }
      });
    }
  });

  afterAll(async () => {
    await h.close();
  });

  const signed = (
    method: 'get' | 'post',
    url: string,
    options: { body?: unknown; key?: KeyName } = {}
  ) => {
    const key = options.key || 'sx-test';
    const ts = String(Math.floor(Date.now() / 1000));
    const nonce = `p-${Date.now()}-${++seq}`;
    const raw = options.body === undefined ? '' : JSON.stringify(options.body);
    let req = request(h.app.getHttpServer())
      [method](`/api${url}`)
      .set('x-fy-key', key)
      .set('x-fy-timestamp', ts)
      .set('x-fy-nonce', nonce)
      .set('x-fy-signature', signFy(SECRETS[key].secret, ts, nonce, method, `/api${url}`, raw));
    if (options.body !== undefined) {
      req = req.set('Content-Type', 'application/json').send(options.body as object);
    }
    return req;
  };

  it('订单上报：记录净消费与节省，¥300 累计得骰；同单重放幂等、不同金额冲突；全额退款收回骰子', async () => {
    const at = new Date().toISOString();
    const first = await signed('post', '/v1/brand-member/orders/report', {
      body: { localUserId: 'local-m-lin', orderRef: 'SX-ORDER-1', paidCents: 18000, savedCents: 300, occurredAt: at }
    });
    expect(first.status).toBe(200);
    // 种子已累计 12000：12000 + 18000 = 30000，正好一颗。
    expect(first.body.dice).toMatchObject({ earned: 1, balance: 13 });
    expect(first.body.progress.remainingCents).toBe(30000);
    expect(first.body.order.savedCents).toBe(300);

    const replay = await signed('post', '/v1/brand-member/orders/report', {
      body: { localUserId: 'local-m-lin', orderRef: 'SX-ORDER-1', paidCents: 18000, savedCents: 300, occurredAt: at }
    });
    expect(replay.status).toBe(200);
    expect(replay.body.replayed).toBe(true);
    expect(await h.prisma.memberOrder.count({ where: { orderRef: 'SX-ORDER-1' } })).toBe(1);

    const conflict = await signed('post', '/v1/brand-member/orders/report', {
      body: { localUserId: 'local-m-lin', orderRef: 'SX-ORDER-1', paidCents: 19000, occurredAt: at }
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error).toBe('IDEMPOTENCY_CONFLICT');

    const noCard = await signed('post', '/v1/brand-member/orders/report', {
      key: 'zc-test',
      body: { localUserId: 'local-m-su', orderRef: 'ZC-ORDER-1', paidCents: 9900, savedCents: 500, occurredAt: at }
    });
    expect(noCard.status).toBe(200);
    expect(noCard.body.dice).toBeNull();
    // 非会员的订单只记净消费，不记会员节省。
    expect(noCard.body.order.savedCents).toBe(0);

    const missing = await signed('post', '/v1/brand-member/orders/refund', {
      body: { localUserId: 'local-m-lin', orderRef: 'SX-NOPE', refundCents: 100, occurredAt: at }
    });
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('ORDER_NOT_FOUND');

    // 累计退款口径：先部分退 6000 就按每颗 ¥300 收回 1 颗（可能扣成负数），
    // 再上报累计 18000 视为整单退款，只补扣差额。
    const partial = await signed('post', '/v1/brand-member/orders/refund', {
      body: { localUserId: 'local-m-lin', orderRef: 'SX-ORDER-1', refundCents: 6000, occurredAt: at }
    });
    expect(partial.status).toBe(200);
    expect(partial.body.order.full).toBe(false);
    expect(partial.body.dice).toMatchObject({ reclaimed: 1, balance: 12 });
    const partialReplay = await signed('post', '/v1/brand-member/orders/refund', {
      body: { localUserId: 'local-m-lin', orderRef: 'SX-ORDER-1', refundCents: 6000, occurredAt: at }
    });
    expect(partialReplay.body.replayed).toBe(true);

    const refund = await signed('post', '/v1/brand-member/orders/refund', {
      body: { localUserId: 'local-m-lin', orderRef: 'SX-ORDER-1', refundCents: 18000, occurredAt: at }
    });
    expect(refund.status).toBe(200);
    expect(refund.body.order.full).toBe(true);
    expect(refund.body.replayed).toBe(false);
    const stale = await signed('post', '/v1/brand-member/orders/refund', {
      body: { localUserId: 'local-m-lin', orderRef: 'SX-ORDER-1', refundCents: 6000, occurredAt: at }
    });
    expect(stale.status).toBe(409);
    expect(await h.prisma.memberOrder.count({ where: { orderRef: 'SX-ORDER-1', kind: 'REFUND' } })).toBe(1);
    const state = await h.prisma.memberGameState.findUniqueOrThrow({ where: { memberId: 'm-lin' } });
    expect(state.diceBalance).toBe(12);
    expect(state.spendCarryCents).toBe(12000);

    const program = await h.api('get', '/members/m-lin/program', cs);
    expect(program.status).toBe(200);
    const sx = program.body.byBusiness.find((row: { business: string }) => row.business === 'sx');
    expect(sx.netPaidCents).toBeGreaterThanOrEqual(0);
    expect(program.body.totals.savedCents).toBe(8000); // 种子 8000，本单 +300 −300
    expect(program.body.canForceRefund).toBe(false);
    const asFinance = await h.api('get', '/members/m-lin/program', finance);
    expect(asFinance.body.canForceRefund).toBe(true);
    expect(asFinance.body.refundQuotes.length).toBeGreaterThan(0);
  });

  it('会员码：默认 30 天直接生效；超过 30 天需他人审批；名额已满、暂停、截止均拒绝；同人重领幂等', async () => {
    const denied = await h.api('post', '/gift-campaigns', cs, { name: '无权限' });
    expect(denied.status).toBe(403);

    const basic = await h.api('post', '/gift-campaigns', ops, {
      name: '健身房合作',
      code: 'GYM2026',
      channelTag: '异业合作',
      referrerType: 'PARTNER',
      referrerName: '某健身房',
      appTarget: 'zc',
      quota: 1
    });
    expect(basic.status).toBe(201);
    expect(basic.body).toMatchObject({
      code: 'GYM2026',
      days: 30,
      status: 'ACTIVE',
      quota: 1,
      appTarget: 'zc',
      appName: '在场'
    });
    // 未指定时默认时叙；非法目标端直接拒绝，避免把码打到错误的小程序。
    const defaultTarget = await h.api('post', '/gift-campaigns', ops, { name: '默认端', code: 'DEFT01' });
    expect(defaultTarget.body.appTarget).toBe('sx');
    const badTarget = await h.api('post', '/gift-campaigns', ops, {
      name: '错误端',
      code: 'BADT01',
      appTarget: 'xx'
    });
    expect(badTarget.status).toBe(400);

    const dup = await h.api('post', '/gift-campaigns', ops, { name: '重复', code: 'GYM2026' });
    expect(dup.status).toBe(409);

    const claim = await signed('post', '/v1/brand-member/gift/claim', {
      body: { localUserId: 'local-m-sx-new', code: 'gym 2026' }
    });
    expect(claim.status).toBe(201);
    expect(claim.body.card).toMatchObject({ source: 'GIFT', productCode: 'FY_GIFT', state: 'ACTIVE' });
    expect(claim.body.days).toBe(30);

    const again = await signed('post', '/v1/brand-member/gift/claim', {
      body: { localUserId: 'local-m-sx-new', code: 'GYM2026' }
    });
    expect(again.status).toBe(201);
    expect(again.body.replayed).toBe(true);

    const full = await signed('post', '/v1/brand-member/gift/claim', {
      body: { localUserId: 'local-m-sx-new2', code: 'GYM2026' }
    });
    expect(full.status).toBe(409);
    expect(full.body.error).toBe('GIFT_CODE_FULL');
    expect(full.body.message).toContain('已满');

    const me = await signed('get', '/v1/brand-member/me?business=teahour&localUserId=local-m-sx-new');
    expect(['ACTIVE', 'EXPIRING']).toContain(me.body.card.state);
    expect(me.body.game.enabled).toBe(true);

    const long = await h.api('post', '/gift-campaigns', ops, {
      name: '渠道大客户',
      code: 'VIP90',
      days: 90
    });
    expect(long.status).toBe(201);
    expect(long.body.status).toBe('PENDING_APPROVAL');
    const pendingClaim = await signed('post', '/v1/brand-member/gift/claim', {
      body: { localUserId: 'local-m-sx-new2', code: 'VIP90' }
    });
    // 待审批的码对外视同不存在，不泄露内部状态。
    expect(pendingClaim.status).toBe(404);
    expect(pendingClaim.body.error).toBe('GIFT_CODE_INVALID');

    const selfApprove = await h.api('post', `/gift-campaigns/${long.body.id}/approve`, admin, {});
    // admin 不是创建人，可审批；创建人 ops 无审批权限。
    const opsApprove = await h.api('post', `/gift-campaigns/${long.body.id}/approve`, ops, {});
    expect(opsApprove.status).toBe(403);
    expect(selfApprove.status).toBe(200);
    expect(selfApprove.body.status).toBe('ACTIVE');

    const paused = await h.api('post', `/gift-campaigns/${long.body.id}/pause`, ops, {});
    expect(paused.status).toBe(200);
    const pausedClaim = await signed('post', '/v1/brand-member/gift/claim', {
      body: { localUserId: 'local-m-sx-new2', code: 'VIP90' }
    });
    expect(pausedClaim.body.error).toBe('GIFT_CODE_PAUSED');
    await h.api('post', `/gift-campaigns/${long.body.id}/resume`, ops, {});

    await h.prisma.giftCampaign.update({
      where: { id: long.body.id },
      data: { claimDeadline: new Date(Date.now() - 1000) }
    });
    const expired = await signed('post', '/v1/brand-member/gift/claim', {
      body: { localUserId: 'local-m-sx-new2', code: 'VIP90' }
    });
    expect(expired.body.error).toBe('GIFT_CODE_EXPIRED');

    const invalid = await signed('post', '/v1/brand-member/gift/claim', {
      body: { localUserId: 'local-m-sx-new2', code: 'NOPE99' }
    });
    expect(invalid.status).toBe(404);
    expect(invalid.body.error).toBe('GIFT_CODE_INVALID');

    const detail = await h.api('get', `/gift-campaigns/${basic.body.id}`, cs);
    expect(detail.status).toBe(200);
    expect(detail.body.campaign.display).toBe('已满');
    expect(detail.body.campaign.appName).toBe('在场');
    expect(detail.body.print.appName).toBe('在场');
    expect(detail.body.claims).toHaveLength(1);

    // 二维码目标端可改；未配置小程序密钥时明确失败，不回退成普通链接码。
    const retarget = await h.api('post', `/gift-campaigns/${basic.body.id}/target`, ops, {
      appTarget: 'ql'
    });
    expect(retarget.status).toBe(200);
    expect(retarget.body.appName).toBe('轻疗');
    delete process.env.WX_SECRET_QL;
    const qr = await h.api('get', `/gift-campaigns/${basic.body.id}/qrcode`, admin);
    expect(qr.status).toBe(503);
    expect(qr.body.error).toBe('WX_NOT_CONFIGURED');
    const qrDenied = await h.api('get', `/gift-campaigns/${basic.body.id}/qrcode`, store);
    expect(qrDenied.status).toBe(403);

    // 赠送卡不走退款
    const quote = await signed('get', `/v1/brand-member/refund-quote?cardId=${claim.body.card.cardId}`);
    expect(quote.body.allowed).toBe(false);
    expect(quote.body.reasonCode).toBe('CARD_NOT_REFUNDABLE');
  });

  it('提货券：店员查码后核销一次；重复核销拒绝；无核销权限拒绝', async () => {
    const lookup = await h.api('get', '/vouchers/fyg8k2qm', store);
    expect(lookup.status).toBe(200);
    expect(lookup.body.voucher.status).toBe('ISSUED');
    expect(lookup.body.member.phoneMasked).toBe('138****6620');

    const denied = await h.api('post', '/vouchers/FYG8K2QM/redeem', finance, { store: '静安店' });
    expect(denied.status).toBe(403);

    const redeemed = await h.api('post', '/vouchers/FYG8K2QM/redeem', store, { store: '静安店' });
    expect(redeemed.status).toBe(200);
    expect(redeemed.body.voucher.status).toBe('REDEEMED');

    const again = await h.api('post', '/vouchers/FYG8K2QM/redeem', store, { store: '徐汇店' });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('VOUCHER_USED');

    const missing = await h.api('get', '/vouchers/NOPE0000', store);
    expect(missing.status).toBe(404);
  });

  it('付费开年卡自动发提货券；7 天内退款扣除已领实物礼价值', async () => {
    const quote = await signed('post', '/v1/brand-member/quote', {
      key: 'zc-test',
      body: { business: 'presence', localUserId: 'local-m-zc-new2', productCode: 'FY_ANNUAL' }
    });
    expect(quote.status).toBe(201);
    const orderRef = 'presence:order:annual-gift';
    const issued = await signed('post', '/v1/brand-member/issue', {
      key: 'zc-test',
      body: { quoteId: quote.body.quoteId, orderRef, paidCents: 29900, paidAt: new Date().toISOString() }
    });
    expect(issued.status).toBe(201);
    expect(issued.body.vouchers.length).toBeGreaterThan(0);
    const first = issued.body.vouchers[0] as { code: string; valueCents: number };

    const redeemed = await h.api('post', `/vouchers/${first.code}/redeem`, store, { store: '在场店' });
    expect(redeemed.status).toBe(200);

    const preview = await signed('get', `/v1/brand-member/refund-quote?orderRef=${orderRef}`, {
      key: 'zc-test'
    });
    expect(preview.body.window).toBe('WITHIN_7D');
    expect(preview.body.refundableCents).toBe(29900 - first.valueCents);

    const refund = await signed('post', '/v1/brand-member/refund', {
      key: 'zc-test',
      body: {
        orderRef,
        refundCents: preview.body.refundableCents,
        refundType: 'WITHIN_7D',
        refundedAt: new Date().toISOString()
      }
    });
    expect(refund.status).toBe(201);
    const left = await h.prisma.pickupVoucher.findMany({
      where: { cardId: issued.body.card.cardId, status: 'ISSUED' }
    });
    expect(left).toHaveLength(0);
  });

  it('意见反馈与会员故事：仅品牌会员可提交与查看；未同意摘录不能关联；发布后会员可见', async () => {
    const nonMember = await signed('post', '/v1/brand-member/feedback', {
      key: 'zc-test',
      body: { localUserId: 'local-m-su', content: '希望增加周末早课' }
    });
    expect(nonMember.status).toBe(403);
    expect(nonMember.body.error).toBe('MEMBERS_ONLY');

    const tooShort = await signed('post', '/v1/brand-member/feedback', {
      body: { localUserId: 'local-m-lin', content: '好' }
    });
    expect(tooShort.status).toBe(400);

    const noQuote = await signed('post', '/v1/brand-member/feedback', {
      body: { localUserId: 'local-m-lin', content: '茶单可以多一些低因选择吗', allowQuote: false }
    });
    expect(noQuote.status).toBe(201);
    const withQuote = await signed('post', '/v1/brand-member/feedback', {
      body: { localUserId: 'local-m-lin', content: '冬天希望有热的桂圆红枣茶', allowQuote: true }
    });
    expect(withQuote.status).toBe(201);

    const list = await h.api('get', '/feedback?status=NEW', cs);
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBeGreaterThanOrEqual(2);
    expect(list.body.items[0].phone).toMatch(/^1\d{10}$/);

    const blocked = await h.api('post', '/stories', cs, {
      title: '不应创建',
      quote: '低因选择',
      story: '我们上新了低因茶。',
      feedbackId: noQuote.body.id
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe('QUOTE_NOT_ALLOWED');

    const draft = await h.api('post', '/stories', cs, {
      title: '冬天的一杯热茶',
      quote: '冬天希望有热的桂圆红枣茶',
      quoteBy: '林女士',
      story: '时叙本周上新了热饮桂圆红枣茶。',
      business: 'sx',
      feedbackId: withQuote.body.id
    });
    expect(draft.status).toBe(201);
    expect(draft.body.status).toBe('DRAFT');

    const before = await signed('get', '/v1/brand-member/stories?localUserId=local-m-lin');
    expect(before.status).toBe(200);
    expect(before.body.stories.some((s: { title: string }) => s.title === '冬天的一杯热茶')).toBe(false);

    const published = await h.api('post', `/stories/${draft.body.id}/publish`, cs, {});
    expect(published.status).toBe(200);
    const after = await signed('get', '/v1/brand-member/stories?localUserId=local-m-lin');
    expect(after.body.stories.some((s: { title: string }) => s.title === '冬天的一杯热茶')).toBe(true);

    const outsider = await signed('get', '/v1/brand-member/stories?localUserId=local-m-su', {
      key: 'zc-test'
    });
    expect(outsider.status).toBe(403);

    const handled = await h.api('post', `/feedback/${noQuote.body.id}`, cs, {
      status: 'READ',
      staffNote: '已转给产品'
    });
    expect(handled.status).toBe(200);
    expect(handled.body.status).toBe('READ');
  });

  it('会员公告：草稿会员不可见；发布后按业务定向；过期不下发；非会员不展示；下线后消失', async () => {
    const day = (offset: number) =>
      new Date(Date.now() + 8 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
    const expireAt = day(30);
    const insecureCover = await h.api('post', '/notices', cs, {
      title: '非 HTTPS 封面',
      body: '这条公告的封面地址不走 HTTPS，应当被拒绝。',
      business: 'teahour',
      coverUrl: 'http://cdn.example.com/notice.jpg'
    });
    expect(insecureCover.status).toBe(400);
    const draft = await h.api('post', '/notices', cs, {
      title: '冬季会员礼遇',
      body: '十二月的会员故事与热饮新品已经准备好，到店出示会员身份即可。',
      business: 'teahour',
      pinned: true,
      store: '上海·徐汇店',
      coverUrl: 'https://cdn.example.com/notice/winter.jpg',
      expireAt
    });
    expect(draft.status).toBe(201);
    expect(draft.body.status).toBe('DRAFT');
    expect(draft.body.store).toBe('上海·徐汇店');
    expect(draft.body.expireAt).toBe(`${expireAt}T23:59:59+08:00`);

    const before = await signed('get', '/v1/brand-member/me?localUserId=local-m-lin&business=teahour');
    expect(before.status).toBe(200);
    expect(before.body.notices).toHaveLength(0);

    const published = await h.api('post', `/notices/${draft.body.id}/publish`, cs, {});
    expect(published.status).toBe(200);
    const after = await signed('get', '/v1/brand-member/me?localUserId=local-m-lin&business=teahour');
    expect(after.body.notices[0].title).toBe('冬季会员礼遇');
    expect(after.body.notices[0].pinned).toBe(true);
    expect(after.body.notices[0].store).toBe('上海·徐汇店');
    expect(after.body.notices[0].coverUrl).toBe('https://cdn.example.com/notice/winter.jpg');
    expect(after.body.notices[0].expireAt).toBe(expireAt);

    // 过期公告不再下发；有效公告最多带 20 条（首屏取 3 条，其余由会员展开）。
    await h.prisma.memberNotice.createMany({
      data: [
        {
          id: 'm-notice-expired',
          title: '已过期的公告',
          body: '这条公告已经过期。',
          business: 'teahour',
          status: 'PUBLISHED',
          pinned: false,
          store: '',
          coverUrl: '',
          expireAt: new Date(Date.now() - 86400000),
          publishedAt: new Date(),
          createdBy: 'test',
          createdByName: '测试'
        },
        ...Array.from({ length: 4 }, (_, index) => ({
          id: `m-notice-more-${index}`,
          title: `补充公告 ${index}`,
          body: '黑板报需要展开才能看到的内容。',
          business: 'teahour',
          status: 'PUBLISHED',
          pinned: false,
          store: '',
          coverUrl: '',
          expireAt: null,
          publishedAt: new Date(Date.now() - (index + 1) * 86400000),
          createdBy: 'test',
          createdByName: '测试'
        }))
      ]
    });
    const board = await signed('get', '/v1/brand-member/me?localUserId=local-m-lin&business=teahour');
    expect(board.body.notices).toHaveLength(5);
    expect(board.body.notices.some((row: { title: string }) => row.title === '已过期的公告')).toBe(false);

    // 在场会员拿到畅练卡附赠会员后，也不应该看到只发给时叙会员的公告。
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    const until = new Date(Date.now() + 8 * 3600000 + 90 * 86400000).toISOString().slice(0, 10);
    const presenceBundle = await signed('post', '/v1/brand-member/bundle', {
      key: 'zc-test',
      body: { localUserId: 'local-m-zc-new', passRef: 'ZC-NOTICE-1', validFrom: today, validUntil: until }
    });
    expect(presenceBundle.status).toBe(200);
    const other = await signed('get', '/v1/brand-member/me?localUserId=local-m-zc-new&business=presence', {
      key: 'zc-test'
    });
    expect(other.status).toBe(200);
    expect(other.body.notices.some((row: { title: string }) => row.title === '冬季会员礼遇')).toBe(false);

    // 时叙本地用户但没有有效卡：公告属于会员内容，不展示。
    await h.prisma.member.create({
      data: { id: 'm-notice-none', memberNo: 'FY-TEST-m-notice-none', phone: '13700000099', name: '公告未开卡' }
    });
    await h.prisma.memberIdentity.create({
      data: {
        id: 'id-m-notice-none',
        business: 'sx',
        localUserId: 'local-m-notice-none',
        memberId: 'm-notice-none'
      }
    });
    const outsider = await signed('get', '/v1/brand-member/me?localUserId=local-m-notice-none&business=teahour');
    expect(outsider.status).toBe(200);
    expect(outsider.body.notices).toHaveLength(0);

    await h.api('post', `/notices/${draft.body.id}/archive`, cs, {});
    const gone = await signed('get', '/v1/brand-member/me?localUserId=local-m-lin&business=teahour');
    expect(gone.body.notices.some((row: { title: string }) => row.title === '冬季会员礼遇')).toBe(false);
  });

  it('在场：畅练卡附赠同有效期品牌会员；每月邀请名额按配置；好友领一次体验课；退畅练卡撤销附赠', async () => {
    const wrongBiz = await signed('post', '/v1/brand-member/bundle', {
      body: { localUserId: 'local-m-lin', passRef: 'X1', validFrom: '2026-11-01', validUntil: '2026-12-01' }
    });
    expect(wrongBiz.status).toBe(403);

    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    const until = new Date(Date.now() + 8 * 3600000 + 90 * 86400000).toISOString().slice(0, 10);
    const bundle = await signed('post', '/v1/brand-member/bundle', {
      key: 'zc-test',
      body: { localUserId: 'local-m-su', passRef: 'ZC-PASS-1', validFrom: today, validUntil: until }
    });
    expect(bundle.status).toBe(200);
    expect(bundle.body.card).toMatchObject({ source: 'BUNDLE', state: 'ACTIVE', validUntil: until });

    const bundleAgain = await signed('post', '/v1/brand-member/bundle', {
      key: 'zc-test',
      body: { localUserId: 'local-m-su', passRef: 'ZC-PASS-1', validFrom: today, validUntil: until }
    });
    expect(bundleAgain.status).toBe(200);
    expect(await h.prisma.memberBrandCard.count({ where: { orderRef: 'zc-pass:ZC-PASS-1' } })).toBe(1);

    const quota = await signed('get', '/v1/brand-member/invites?localUserId=local-m-su', { key: 'zc-test' });
    expect(quota.status).toBe(200);
    expect(quota.body.quota).toBe(1);

    const invite = await signed('post', '/v1/brand-member/invites/create', {
      key: 'zc-test',
      body: { localUserId: 'local-m-su' }
    });
    expect(invite.status).toBe(201);
    expect(invite.body.remaining).toBe(0);
    const over = await signed('post', '/v1/brand-member/invites/create', {
      key: 'zc-test',
      body: { localUserId: 'local-m-su' }
    });
    expect(over.status).toBe(409);
    expect(over.body.error).toBe('INVITE_QUOTA_EXCEEDED');

    const self = await signed('post', '/v1/brand-member/invites/claim', {
      key: 'zc-test',
      body: { localUserId: 'local-m-su', code: invite.body.code }
    });
    expect(self.body.error).toBe('INVITE_SELF');

    const claimed = await signed('post', '/v1/brand-member/invites/claim', {
      key: 'zc-test',
      body: { localUserId: 'local-m-zc-new', code: invite.body.code }
    });
    expect(claimed.status).toBe(200);
    expect(claimed.body.voucher.kind).toBe('PRESENCE_FREE_CLASS');

    const taken = await signed('post', '/v1/brand-member/invites/claim', {
      key: 'zc-test',
      body: { localUserId: 'local-m-zc-new2', code: invite.body.code }
    });
    expect(taken.body.error).toBe('INVITE_USED');

    const revoke = await signed('post', '/v1/brand-member/bundle/revoke', {
      key: 'zc-test',
      body: { localUserId: 'local-m-su', passRef: 'ZC-PASS-1', reason: '畅练卡退卡' }
    });
    expect(revoke.status).toBe(200);
    const card = await h.prisma.memberBrandCard.findFirstOrThrow({ where: { orderRef: 'zc-pass:ZC-PASS-1' } });
    expect(card.state).toBe('REFUNDED');
    expect(card.refundType).toBe('BUNDLE_REVOKED');
    const me = await signed('get', '/v1/brand-member/me?business=presence&localUserId=local-m-su', {
      key: 'zc-test'
    });
    expect(me.body.card.state).toBe('NONE');
  });

  it('畅练卡与已有品牌会员取较晚的到期日：已有更晚则保留，已有更早则接续到畅练卡截止日', async () => {
    const day = (offset: number) =>
      new Date(Date.now() + 8 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
    const makeMember = async (id: string, phoneTail: string) => {
      await h.prisma.member.create({
        data: { id, memberNo: `FY-TEST-${id}`, phone: `1370000${phoneTail}`, name: '顺延测试' }
      });
      await h.prisma.memberIdentity.create({
        data: { id: `id-${id}`, business: 'zc', localUserId: `local-${id}`, memberId: id }
      });
    };
    const paidCard = (id: string, from: string, until: string) =>
      h.prisma.memberBrandCard.create({
        data: {
          id: `MBC-${id}-paid`,
          memberId: id,
          productCode: 'FY_ANNUAL',
          version: 1,
          productName: 'Full愈年卡',
          priceCents: 29900,
          validDays: 200,
          validFrom: new Date(`${from}T00:00:00+08:00`),
          validUntil: new Date(`${until}T00:00:00+08:00`),
          state: 'ACTIVE',
          soldBy: 'sx',
          soldByName: '时叙',
          orderRef: `paid-test:${id}`,
          paidCents: 29900,
          paidAt: new Date(),
          source: 'PAID'
        }
      });

    // 已有会员更晚：以原会员为准，畅练卡附赠卡不能把它顶掉。
    await makeMember('m-later', '9901');
    await paidCard('m-later', day(0), day(200));
    const later = await signed('post', '/v1/brand-member/bundle', {
      key: 'zc-test',
      body: { localUserId: 'local-m-later', passRef: 'ZC-PASS-LATER', validFrom: day(0), validUntil: day(90) }
    });
    expect(later.status).toBe(200);
    const laterMe = await signed('get', '/v1/brand-member/me?business=presence&localUserId=local-m-later', {
      key: 'zc-test'
    });
    expect(laterMe.body.card.source).toBe('PAID');
    expect(laterMe.body.card.validUntil).toBe(day(200));

    // 已有会员更早：品牌会员有效期接续到畅练卡截止日。
    await makeMember('m-earlier', '9902');
    await paidCard('m-earlier', day(0), day(30));
    const earlier = await signed('post', '/v1/brand-member/bundle', {
      key: 'zc-test',
      body: { localUserId: 'local-m-earlier', passRef: 'ZC-PASS-EARLIER', validFrom: day(0), validUntil: day(120) }
    });
    expect(earlier.status).toBe(200);
    const earlierMe = await signed('get', '/v1/brand-member/me?business=presence&localUserId=local-m-earlier', {
      key: 'zc-test'
    });
    expect(earlierMe.body.card.source).toBe('BUNDLE');
    expect(earlierMe.body.card.validUntil).toBe(day(120));
  });
});
