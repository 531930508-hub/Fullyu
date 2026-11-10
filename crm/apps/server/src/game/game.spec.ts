import { createHash, createHmac } from 'node:crypto';
import request from 'supertest';
import { ACCOUNTS, createHarness, type Harness } from '../testing/harness';
import { GameService } from './game.service';

/**
 * 1D：规则版本、骰子账本、愈行之旅掷骰与礼物核销。
 * 对外接口沿用 X-Fy 签名；管理接口使用后台 JWT 与权限点。
 */
const SECRETS = {
  'ql-test': { business: 'ql', secret: 'ql-secret-for-jest-0001' },
  'sx-test': { business: 'sx', secret: 'sx-secret-for-jest-0002' },
  'zc-test': { business: 'zc', secret: 'zc-secret-for-jest-0003' }
} as const;

type KeyName = keyof typeof SECRETS;

process.env.CRM_EXT_KEYS = JSON.stringify(SECRETS);
process.env.CRM_GAME_URL = 'https://game.test/play';

const signFy = (
  secret: string,
  timestamp: string,
  nonce: string,
  method: string,
  url: string,
  rawBody: string
): string => {
  const bodyHash = createHash('sha256').update(rawBody, 'utf8').digest('hex');
  return createHmac('sha256', secret)
    .update(`${timestamp}\n${nonce}\n${method.toUpperCase()}\n${url}\n${bodyHash}`, 'utf8')
    .digest('hex');
};

describe('CRM 1D：规则版本、骰子账本与愈行之旅', () => {
  let h: Harness;
  let admin: string;
  let cs: string;
  let finance: string;
  let nonceSeq = 0;

  beforeAll(async () => {
    h = await createHarness();
    admin = await h.login(ACCOUNTS.admin);
    cs = await h.login(ACCOUNTS.cs);
    finance = await h.login(ACCOUNTS.finance);
  });

  afterAll(async () => {
    await h.close();
  });

  const server = () => h.app.getHttpServer();
  const nonce = () => `g-${Date.now()}-${++nonceSeq}`;

  const signed = (
    method: 'get' | 'post',
    url: string,
    options: {
      body?: unknown;
      key?: KeyName;
      headers?: Record<string, string>;
    } = {}
  ) => {
    const key = options.key || 'sx-test';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonceValue = nonce();
    const raw = options.body === undefined ? '' : JSON.stringify(options.body);
    const signature = signFy(
      SECRETS[key].secret,
      timestamp,
      nonceValue,
      method,
      `/api${url}`,
      raw
    );
    let req = request(server())
      [method](`/api${url}`)
      .set('x-fy-key', key)
      .set('x-fy-timestamp', timestamp)
      .set('x-fy-nonce', nonceValue)
      .set('x-fy-signature', signature);
    for (const [name, value] of Object.entries(options.headers || {})) req = req.set(name, value);
    if (options.body !== undefined) {
      req = req.set('Content-Type', 'application/json').send(options.body as object);
    }
    return req;
  };

  const earn = (body: Record<string, unknown>, key: KeyName = 'sx-test') =>
    signed('post', '/v1/brand-member/dice/earn', { body, key });

  const roll = (body: Record<string, unknown>, idem?: string, key: KeyName = 'sx-test') =>
    signed('post', '/v1/brand-member/game/roll', {
      body,
      key,
      headers: idem ? { 'Idempotency-Key': idem } : {}
    });

  it('现行规则可读；新版本必须未来生效，可撤销；无权限角色被拒', async () => {
    const rules = await h.api('get', '/rules', admin);
    expect(rules.status).toBe(200);
    expect(rules.body.points.sx[0].version).toBeGreaterThanOrEqual(1);
    expect(rules.body.points.sx.some((v: { status: string }) => v.status === 'CURRENT')).toBe(true);
    expect(rules.body.dice.all[0].rules.centsPerDie).toBeGreaterThan(0);

    const past = await h.api('post', '/rules/dice/versions', admin, {
      scope: 'all',
      effectiveFrom: new Date(Date.now() - 86400000).toISOString(),
      reason: '不应生效',
      rules: { ...rules.body.dice.all[0].rules, centsPerDie: 32000 }
    });
    expect(past.status).toBe(400);
    expect(past.body.error).toBe('EFFECTIVE_FROM_MUST_BE_FUTURE');

    const future = new Date(Date.now() + 3 * 86400000).toISOString();
    const created = await h.api('post', '/rules/dice/versions', admin, {
      scope: 'all',
      effectiveFrom: future,
      reason: '测试新版本',
      rules: { ...rules.body.dice.all[0].rules, centsPerDie: 32000 }
    });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('SCHEDULED');
    expect(created.body.rules.centsPerDie).toBe(32000);
    // 2026-11-09 起规则不再有单笔/每月上限。
    expect(created.body.rules.perOrderCap).toBeUndefined();
    expect(created.body.rules.monthCap).toBeUndefined();

    const canceled = await h.api(
      'post',
      `/rules/dice/versions/${created.body.version}/cancel`,
      admin,
      { scope: 'all' }
    );
    expect(canceled.status).toBe(200);
    expect(canceled.body.status).toBe('CANCELED');

    const denied = await h.api('post', '/rules/dice/versions', cs, {
      scope: 'all',
      effectiveFrom: future,
      rules: rules.body.dice.all[0].rules,
      reason: '无权限'
    });
    expect(denied.status).toBe(403);

    const audit = await h.api('get', `/audit?action=${encodeURIComponent('规则')}`, admin);
    expect(audit.body.logs.length).toBeGreaterThanOrEqual(1);
  });

  it('订单得骰：¥300 一颗、不足部分跨单累计；不设单笔上限；同订单幂等；签到默认不送骰', async () => {
    // 种子：m-lin 已累计 12000 分未成骰，余额 12 颗。
    const first = await earn({
      business: 'teahour',
      localUserId: 'local-m-lin',
      kind: 'order',
      orderRef: 'TH-1D-0001',
      paidCents: 23600
    });
    expect(first.status).toBe(200);
    expect(first.body.dice).toBe(1); // (12000 + 23600) / 30000 = 1，余 5600
    expect(first.body.carryCents).toBe(5600);
    expect(first.body.balance).toBe(13);
    expect(first.body.progress.remainingCents).toBe(24400);
    expect(first.body.progress.tip.business).toBe('ql');
    expect(first.body.progress.headline).toContain('244');

    const replay = await earn({
      business: 'teahour',
      localUserId: 'local-m-lin',
      kind: 'order',
      orderRef: 'TH-1D-0001',
      paidCents: 23600
    });
    expect(replay.status).toBe(200);
    expect(replay.body.dice).toBe(1);
    expect(replay.body.balance).toBe(13);
    expect(replay.body.replayed).toBe(true);

    const bigOrder = await earn({
      business: 'teahour',
      localUserId: 'local-m-lin',
      kind: 'order',
      orderRef: 'TH-1D-0002',
      paidCents: 990000
    });
    expect(bigOrder.body.dice).toBe(33); // 不设单笔上限：¥9900 实付得 33 颗
    expect(bigOrder.body.capped).toBe(false);
    expect(bigOrder.body.carryCents).toBe(5600);
    expect(bigOrder.body.balance).toBe(46);

    const checkin = await earn({
      business: 'teahour',
      localUserId: 'local-m-lin',
      kind: 'checkin'
    });
    expect(checkin.status).toBe(200);
    expect(checkin.body.dice).toBe(0);

    const checkinAgain = await earn({
      business: 'teahour',
      localUserId: 'local-m-lin',
      kind: 'checkin'
    });
    expect(checkinAgain.body.dice).toBe(0);
    expect(checkinAgain.body.replayed).toBe(true);
    expect(checkinAgain.body.balance).toBe(checkin.body.balance);
  });

  it('不再有月上限；无有效卡会员不得得骰或掷骰', async () => {
    const current = await h.prisma.ruleSetVersion.findFirstOrThrow({
      where: { ruleKey: 'dice', scope: 'all', status: 'CURRENT' }
    });
    const rule = JSON.parse(current.rulesJson);
    // 旧版本残留的 monthCap 读取时忽略，不能再截断发放。
    await h.prisma.ruleSetVersion.update({
      where: { id: current.id },
      data: { rulesJson: JSON.stringify({ ...rule, monthCap: 2 }) }
    });
    await h.prisma.memberGameState.update({
      where: { memberId: 'm-lin' },
      data: { monthlyEarned: 0 }
    });

    const earned = await earn({
      business: 'teahour',
      localUserId: 'local-m-lin',
      kind: 'order',
      orderRef: 'TH-1D-0003',
      paidCents: 90000
    });
    expect(earned.body.dice).toBe(3);
    expect(earned.body.capped).toBe(false);

    const noCard = await earn(
      {
        business: 'presence',
        localUserId: 'local-m-su',
        kind: 'order',
        orderRef: 'ZC-1D-0001',
        paidCents: 23600
      },
      'zc-test'
    );
    expect(noCard.status).toBe(403);
    expect(noCard.body.error).toBe('GAME_UNAVAILABLE');

    const noCardRoll = await roll(
      { business: 'presence', localUserId: 'local-m-su' },
      'roll-no-card',
      'zc-test'
    );
    expect(noCardRoll.status).toBe(403);
  });

  it('掷骰消耗 1 颗、绕圈进位、同幂等键不重复扣减', async () => {
    const game = h.app.get(GameService);
    jest.spyOn(game as unknown as { nextDie: () => number }, 'nextDie').mockReturnValue(4);
    await h.prisma.memberGameState.update({
      where: { memberId: 'm-lin' },
      data: { diceBalance: 3, station: 8, lap: 0 }
    });

    const first = await roll(
      { business: 'teahour', localUserId: 'local-m-lin' },
      'roll-1d-a'
    );
    expect(first.status).toBe(201);
    expect(first.body.dice).toBe(4);
    expect(first.body.station).toBe(0);
    expect(first.body.lap).toBe(1);
    expect(first.body.balance).toBe(2);
    // 起点站在第 2 圈：每站都有积分，第 2 圈档位 3–5 分。
    expect(first.body.points).toBeGreaterThanOrEqual(3);
    expect(first.body.points).toBeLessThanOrEqual(5);
    expect(first.body.board.cells).toHaveLength(12);
    const ledger = await h.prisma.pointLedger.findFirst({
      where: { memberId: 'm-lin', type: 'GAME', ref: first.body.rollId }
    });
    expect(ledger?.delta).toBe(first.body.points);

    const replay = await roll(
      { business: 'teahour', localUserId: 'local-m-lin' },
      'roll-1d-a'
    );
    expect(replay.status).toBe(201);
    expect(replay.body.rollId).toBe(first.body.rollId);
    expect(replay.body.balance).toBe(2);

    const state = await h.prisma.memberGameState.findUniqueOrThrow({
      where: { memberId: 'm-lin' }
    });
    expect(state.diceBalance).toBe(2);
  });

  it('落在礼物站生成待领礼物；到店人工确认只成功一次；过期不可领', async () => {
    const game = h.app.get(GameService);
    jest.spyOn(game as unknown as { nextDie: () => number }, 'nextDie').mockReturnValue(1);
    // rng 固定为 0.99：礼物站洗牌不变，第 1 圈唯一的券位落在 3 号站。
    jest.spyOn(game as unknown as { rng: () => number }, 'rng').mockReturnValue(0.99);
    await h.prisma.memberGameState.update({
      where: { memberId: 'm-lin' },
      data: { diceBalance: 2, station: 2, lap: 0 }
    });

    const result = await roll(
      { business: 'teahour', localUserId: 'local-m-lin' },
      'roll-1d-chest'
    );
    expect(result.status).toBe(201);
    expect(result.body.station).toBe(3);
    expect(result.body.prize).toBeTruthy();
    expect(result.body.prize.status).toBe('PENDING');
    // 第 1 圈只出时叙茶饮，不出折扣、不出轻疗。
    expect(result.body.prize.name).toBe('时叙 · 免费茶饮一杯');
    expect(result.body.points).toBe(0);

    const me = await signed('get', '/v1/brand-member/me?business=teahour&localUserId=local-m-lin');
    expect(me.status).toBe(200);
    expect(me.body.prizes.pending).toBe(1);

    const listed = await h.api('get', '/game/prizes?status=PENDING', admin);
    expect(listed.status).toBe(200);
    const prize = listed.body.prizes.find((p: { id: string }) => p.id === result.body.prize.id);
    expect(prize).toBeTruthy();

    const denied = await h.api('post', `/game/prizes/${prize.id}/collect`, finance, {});
    expect(denied.status).toBe(403);

    const collected = await h.api('post', `/game/prizes/${prize.id}/collect`, cs, {
      note: '静安店人工交付'
    });
    expect(collected.status).toBe(200);
    expect(collected.body.status).toBe('COLLECTED');

    const again = await h.api('post', `/game/prizes/${prize.id}/collect`, cs, {});
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('PRIZE_ALREADY_COLLECTED');

    const expired = await h.prisma.gamePrize.create({
      data: {
        id: 'pz-expired-1d',
        memberId: 'm-lin',
        rollId: result.body.rollId,
        station: 7,
        name: '已过期礼物',
        business: 'sx',
        status: 'PENDING',
        expiresAt: new Date(Date.now() - 86400000)
      }
    });
    const expiredCollect = await h.api(
      'post',
      `/game/prizes/${expired.id}/collect`,
      cs,
      {}
    );
    expect(expiredCollect.status).toBe(409);
    expect(expiredCollect.body.error).toBe('PRIZE_EXPIRED');
  });

  it('骰子余额不足拒绝掷骰；退款收回该单骰子并把累计金额还原', async () => {
    await h.prisma.memberGameState.update({
      where: { memberId: 'm-lin' },
      data: { diceBalance: 0, station: 0, lap: 0 }
    });
    const noDice = await roll(
      { business: 'teahour', localUserId: 'local-m-lin' },
      'roll-1d-empty'
    );
    expect(noDice.status).toBe(403);
    expect(noDice.body.error).toBe('NO_DICE');

    await h.prisma.memberGameState.update({
      where: { memberId: 'm-lin' },
      data: { diceBalance: 3 }
    });
    const refund = await signed('post', '/v1/brand-member/dice/refund', {
      body: {
        business: 'teahour',
        localUserId: 'local-m-lin',
        orderRef: 'TH-1D-0001'
      }
    });
    expect(refund.status).toBe(200);
    // TH-1D-0001 得 1 颗；退款后累计 = 5600 − 23600 + 30000 = 12000。
    expect(refund.body.reclaimed).toBe(1);
    expect(refund.body.balance).toBe(2);
    expect(refund.body.carryCents).toBe(12000);

    const replay = await signed('post', '/v1/brand-member/dice/refund', {
      body: {
        business: 'teahour',
        localUserId: 'local-m-lin',
        orderRef: 'TH-1D-0001'
      }
    });
    expect(replay.status).toBe(200);
    expect(replay.body.reclaimed).toBe(0);
    expect(replay.body.replayed).toBe(true);
  });

  it('游戏会话返回棋盘、流水与礼物；跨业务密钥不可读其他会员', async () => {
    const session = await signed(
      'get',
      '/v1/brand-member/game?business=teahour&localUserId=local-m-lin'
    );
    expect(session.status).toBe(200);
    expect(session.body.board.stations).toHaveLength(12);
    expect(session.body.board.chestStations).toEqual([3, 7, 11]);
    expect(session.body.board.cells).toHaveLength(12);
    expect(session.body.progress.perDieCents).toBe(30000);
    expect(Array.isArray(session.body.ledger)).toBe(true);
    expect(Array.isArray(session.body.prizes)).toBe(true);
    expect(session.body.dice.balance).toBeGreaterThanOrEqual(0);

    const wrongBusiness = await signed(
      'get',
      '/v1/brand-member/game?business=teahour&localUserId=local-m-su'
    );
    expect(wrongBusiness.status).toBe(404);
    expect(wrongBusiness.body.error).toBe('MEMBER_NOT_FOUND');
  });

  it('骰子已被玩掉后整单退款可扣成负数；后续所得先抵扣欠账，进度按欠账加长', async () => {
    await h.prisma.memberGameState.update({
      where: { memberId: 'm-lin' },
      data: { diceBalance: 0, spendCarryCents: 0, station: 0, lap: 0 }
    });

    const earned = await earn({
      business: 'teahour',
      localUserId: 'local-m-lin',
      kind: 'order',
      orderRef: 'TH-NEG-0001',
      paidCents: 90000
    });
    expect(earned.body.dice).toBe(3);
    expect(earned.body.balance).toBe(3);

    // 三颗骰子已掷出：余额归零后再整单退款，欠账直接变成负数。
    await h.prisma.memberGameState.update({
      where: { memberId: 'm-lin' },
      data: { diceBalance: 0 }
    });
    const refund = await signed('post', '/v1/brand-member/dice/refund', {
      body: {
        business: 'teahour',
        localUserId: 'local-m-lin',
        orderRef: 'TH-NEG-0001'
      }
    });
    expect(refund.status).toBe(200);
    expect(refund.body.reclaimed).toBe(3);
    expect(refund.body.balance).toBe(-3);
    expect(refund.body.carryCents).toBe(0);
    expect(refund.body.progress.deficitDice).toBe(3);
    expect(refund.body.progress.nextUsableCents).toBe(120000);
    expect(refund.body.progress.headline).toContain('1200');

    // 之后每得 1 颗先还债：-3 → -2，仍未真正可用。
    const next = await earn({
      business: 'teahour',
      localUserId: 'local-m-lin',
      kind: 'order',
      orderRef: 'TH-NEG-0002',
      paidCents: 30000
    });
    expect(next.body.dice).toBe(1);
    expect(next.body.balance).toBe(-2);
    expect(next.body.progress.deficitDice).toBe(2);
    expect(next.body.progress.nextUsableCents).toBe(90000);

    // 一次得 4 颗，抵完欠账后净增 1 颗。
    const repay = await earn({
      business: 'teahour',
      localUserId: 'local-m-lin',
      kind: 'order',
      orderRef: 'TH-NEG-0003',
      paidCents: 120000
    });
    expect(repay.body.dice).toBe(4);
    expect(repay.body.balance).toBe(2);
    expect(repay.body.progress.deficitDice).toBe(0);

    await h.prisma.memberGameState.update({
      where: { memberId: 'm-lin' },
      data: { diceBalance: 12, spendCarryCents: 0 }
    });
  });
});
