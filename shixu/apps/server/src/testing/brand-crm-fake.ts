import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * 测试用品牌会员 CRM 假服务（X-Fy 契约）。
 *
 * 与旧 /api/external/* 的 x-crm-* 不同：签名串带 nonce，路径含查询串，
 * 且同一 key + nonce 第二次请求必须返回 409 REPLAYED。测试按真实契约校验，
 * 避免客户端与 CRM 的签名算法在后续改动中漂移。
 */

export type FakeBrandRequest = {
  method: string;
  path: string;
  body: string;
  keyId: string;
  nonce: string;
  signatureOk: boolean;
};

export type FakeBrandCrm = {
  url: string;
  requests: FakeBrandRequest[];
  cardState: 'ACTIVE' | 'NONE';
  points: number;
  dice: number;
  station: number;
  failNext: { status: number; body: unknown } | null;
  delayMs: number;
  giftClaims: Set<string>;
  feedback: Array<{ localUserId: string; content: string; allowQuote: boolean }>;
  orders: Map<string, { localUserId: string; paidCents: number; refundCents: number }>;
  missingMembers: Set<string>;
  close: () => Promise<void>;
};

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

const reply = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

export const signBrandPayload = (
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

const signatureOk = (
  req: IncomingMessage,
  rawBody: string,
  secret: string,
  path: string
): boolean => {
  const timestamp = String(req.headers['x-fy-timestamp'] || '');
  const nonce = String(req.headers['x-fy-nonce'] || '');
  const given = Buffer.from(String(req.headers['x-fy-signature'] || ''), 'utf8');
  const expected = Buffer.from(
    signBrandPayload(secret, timestamp, nonce, req.method || 'GET', path, rawBody),
    'utf8'
  );
  return given.length === expected.length && timingSafeEqual(given, expected);
};

const cardPayload = (state: 'ACTIVE' | 'NONE') =>
  state === 'ACTIVE'
    ? {
        cardId: 'MBC-TEST-1',
        state: 'ACTIVE',
        productCode: 'FY_ANNUAL',
        productName: 'Full愈年卡',
        priceCents: 29900,
        validFrom: '2026-10-30',
        validUntil: '2027-10-29',
        remainingDays: 356,
        soldBy: 'teahour',
        soldByName: '时叙'
      }
    : { state: 'NONE' };

export async function startFakeBrandCrm(options: {
  keyId: string;
  secret: string;
  business?: string;
}): Promise<FakeBrandCrm> {
  const { keyId, secret } = options;
  const business = options.business || 'teahour';
  const requests: FakeBrandRequest[] = [];
  const nonces = new Set<string>();
  let seq = 0;

  const state: FakeBrandCrm = {
    url: '',
    requests,
    cardState: 'ACTIVE',
    points: 500,
    dice: 12,
    station: 8,
    failNext: null,
    delayMs: 0,
    giftClaims: new Set(),
    feedback: [],
    orders: new Map(),
    missingMembers: new Set(),
    close: async () => undefined
  };

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    const path = req.url || '/';
    const rawBody = await readBody(req);
    const key = String(req.headers['x-fy-key'] || '');
    const nonce = String(req.headers['x-fy-nonce'] || '');
    const ok = key === keyId && signatureOk(req, rawBody, secret, path);
    requests.push({ method: req.method || '', path, body: rawBody, keyId: key, nonce, signatureOk: ok });

    if (state.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, state.delayMs));
    }
    if (state.failNext) {
      const failure = state.failNext;
      state.failNext = null;
      reply(res, failure.status, failure.body);
      return;
    }
    if (!ok) {
      reply(res, 401, { error: 'INVALID_SIGNATURE', message: '签名不正确' });
      return;
    }
    if (!nonce || nonces.has(nonce)) {
      reply(res, 409, { error: 'REPLAYED', message: '该签名已被使用，请换新的 nonce' });
      return;
    }
    nonces.add(nonce);

    const url = new URL(path, 'http://fake');
    const route = url.pathname;

    if (req.method === 'GET' && route === '/api/v1/brand-member/me') {
      if (url.searchParams.get('business') !== business) {
        reply(res, 403, { error: 'BUSINESS_MISMATCH', message: '业务不匹配' });
        return;
      }
      const localUserId = url.searchParams.get('localUserId') || '';
      if (!localUserId) {
        reply(res, 400, { error: 'BAD_REQUEST', message: '缺少 localUserId' });
        return;
      }
      if (localUserId === 'missing') {
        reply(res, 404, { error: 'MEMBER_NOT_FOUND', message: '该用户尚未同步到 CRM' });
        return;
      }
      const card = cardPayload(state.cardState);
      reply(res, 200, {
        member: { memberNo: 'FY-TEST-000001', name: '林小满', phoneMasked: '138****6620' },
        card,
        points: {
          balance: state.points,
          expiring: 0,
          expireAt: null,
          spend: { teahour: 'display_only', presence: 'display_only', retreat: '1_point_1_yuan' }
        },
        dice: {
          balance: state.dice,
          station: state.station,
          monthlyEarned: state.dice,
          progress: {
            perDieCents: 30000,
            progressCents: 24000,
            remainingCents: 6000,
            percent: 80,
            headline: '再消费 ¥60 可再得一次游戏机会',
            tip: { business: 'sx', external: 'teahour', title: '来时叙喝杯茶', text: '只差一点点了，来时叙喝杯茶，或带一份茶礼回家。' }
          }
        },
        prizes: { pending: 1 },
        savedCents: 0,
        renewal: { show: false, savedCents: 0, remainingDays: 356, text: '' },
        vouchers: [
          {
            code: 'PV-TEST-0001',
            title: '年卡茶礼一份',
            desc: '任一门店出示提货码核销一次',
            valueCents: 6800,
            status: 'ISSUED',
            issuedAt: '2026-10-30T10:00:00+08:00',
            redeemedAt: null,
            redeemedStore: null
          }
        ],
        benefits: [
          { business, title: '时叙 · 会员茶饮权益', desc: '会员专属茶饮权益，具体内容以门店公示为准' }
        ],
        businessCards: [],
        game: {
          enabled: state.cardState === 'ACTIVE',
          dice: state.dice,
          url: state.cardState === 'ACTIVE' ? 'https://crm.test/game/?embed=1&host=teahour&ticket=tk_fake' : null
        },
        updatedAt: '2026-11-08T10:42:00+08:00',
        stale: false
      });
      return;
    }

    if (req.method === 'GET' && route === '/api/v1/brand-member/products') {
      reply(res, 200, {
        products: [
          {
            code: 'FY_MONTH',
            name: 'Full愈月卡',
            priceCents: 4500,
            validDays: 30,
            benefits: [],
            pointsSpend: {},
            gameEnabled: true
          },
          {
            code: 'FY_ANNUAL',
            name: 'Full愈年卡',
            priceCents: 29900,
            validDays: 365,
            benefits: [],
            pointsSpend: {},
            gameEnabled: true
          }
        ]
      });
      return;
    }

    if (req.method === 'POST' && route === '/api/v1/brand-member/quote') {
      const input = JSON.parse(rawBody || '{}') as { productCode?: string; business?: string };
      if (input.business !== business) {
        reply(res, 403, { error: 'BUSINESS_MISMATCH', message: '业务不匹配' });
        return;
      }
      if (input.productCode !== 'FY_ANNUAL' && input.productCode !== 'FY_MONTH') {
        reply(res, 404, { error: 'PRODUCT_NOT_FOUND', message: '产品不存在或未生效' });
        return;
      }
      seq += 1;
      reply(res, 201, {
        quoteId: `BCQ-TEST-${seq}`,
        productCode: input.productCode,
        priceCents: input.productCode === 'FY_ANNUAL' ? 29900 : 4500,
        validDays: input.productCode === 'FY_ANNUAL' ? 365 : 30,
        expiresAt: '2026-11-08T11:12:00+08:00'
      });
      return;
    }

    if (req.method === 'POST' && route === '/api/v1/brand-member/issue') {
      const input = JSON.parse(rawBody || '{}') as {
        quoteId?: string;
        orderRef?: string;
        paidCents?: number;
      };
      if (!input.quoteId || !input.orderRef || !input.paidCents) {
        reply(res, 400, { error: 'BAD_REQUEST', message: '缺少开卡参数' });
        return;
      }
      reply(res, 201, {
        card: {
          ...cardPayload('ACTIVE'),
          orderRef: input.orderRef,
          paidCents: input.paidCents
        },
        replayed: false
      });
      return;
    }

    if (req.method === 'POST' && route === '/api/v1/brand-member/game/ticket') {
      const input = JSON.parse(rawBody || '{}') as { business?: string };
      if (input.business !== business) {
        reply(res, 403, { error: 'BUSINESS_MISMATCH', message: '业务不匹配' });
        return;
      }
      if (state.cardState !== 'ACTIVE') {
        reply(res, 403, { error: 'GAME_UNAVAILABLE', message: '开通有效品牌卡后才能进入愈行之旅' });
        return;
      }
      reply(res, 201, {
        ticket: 'tk_fake_0123456789abcdef',
        url: 'https://crm.test/game/?embed=1&host=teahour&ticket=tk_fake_0123456789abcdef',
        expiresAt: '2026-11-08T10:47:00+08:00'
      });
      return;
    }

    if (req.method === 'POST' && route === '/api/v1/brand-member/gift/claim') {
      const input = JSON.parse(rawBody || '{}') as { localUserId?: string; code?: string };
      if (!input.localUserId) {
        reply(res, 400, { error: 'BAD_REQUEST', message: '缺少 localUserId' });
        return;
      }
      if (input.code === 'FULL0001') {
        reply(res, 409, { error: 'GIFT_CODE_FULL', message: '该会员码名额已满' });
        return;
      }
      if (input.code !== 'WELCOME30') {
        reply(res, 404, { error: 'GIFT_CODE_INVALID', message: '会员码不存在，请核对后再试' });
        return;
      }
      const replayed = state.giftClaims.has(input.localUserId);
      state.giftClaims.add(input.localUserId);
      state.cardState = 'ACTIVE';
      reply(res, 201, { card: cardPayload('ACTIVE'), days: 30, replayed });
      return;
    }

    if (req.method === 'POST' && route === '/api/v1/brand-member/feedback') {
      const input = JSON.parse(rawBody || '{}') as { localUserId?: string; content?: string; allowQuote?: boolean };
      if (state.cardState !== 'ACTIVE') {
        reply(res, 403, { error: 'MEMBERS_ONLY', message: '意见反馈仅对品牌会员开放' });
        return;
      }
      state.feedback.push({ localUserId: input.localUserId || '', content: input.content || '', allowQuote: input.allowQuote === true });
      reply(res, 201, { id: `FB-TEST-${state.feedback.length}` });
      return;
    }

    if (req.method === 'GET' && route === '/api/v1/brand-member/stories') {
      if (state.cardState !== 'ACTIVE') {
        reply(res, 403, { error: 'MEMBERS_ONLY', message: '会员故事仅对品牌会员开放' });
        return;
      }
      reply(res, 200, {
        stories: [
          {
            id: 'ST-TEST-1',
            title: '下班后的一小时',
            quote: '终于有个地方能让我慢下来。',
            quoteBy: '林女士',
            story: '她每周三来喝一杯醒，再去在场上课。',
            business: 'sx',
            publishedAt: '2026-11-01T10:00:00+08:00'
          }
        ]
      });
      return;
    }

    if (req.method === 'POST' && route === '/api/v1/brand-member/orders/report') {
      const input = JSON.parse(rawBody || '{}') as {
        localUserId?: string;
        orderRef?: string;
        paidCents?: number;
      };
      if (!input.localUserId || state.missingMembers.has(input.localUserId)) {
        reply(res, 404, { error: 'MEMBER_NOT_FOUND', message: '该用户尚未同步到 CRM' });
        return;
      }
      const prior = state.orders.get(input.orderRef || '');
      if (prior && prior.paidCents !== input.paidCents) {
        reply(res, 409, { error: 'IDEMPOTENCY_CONFLICT', message: '该订单已按其他金额上报' });
        return;
      }
      if (!prior) {
        state.orders.set(input.orderRef || '', {
          localUserId: input.localUserId,
          paidCents: input.paidCents || 0,
          refundCents: 0
        });
      }
      reply(res, 200, { order: { orderRef: input.orderRef }, replayed: Boolean(prior) });
      return;
    }

    if (req.method === 'POST' && route === '/api/v1/brand-member/orders/refund') {
      const input = JSON.parse(rawBody || '{}') as { orderRef?: string; refundCents?: number };
      const prior = state.orders.get(input.orderRef || '');
      if (!prior) {
        reply(res, 404, { error: 'ORDER_NOT_FOUND', message: '未找到该会员的原订单上报记录' });
        return;
      }
      const refundCents = input.refundCents || 0;
      if (refundCents < prior.refundCents) {
        reply(res, 409, { error: 'IDEMPOTENCY_CONFLICT', message: '该订单已上报更高的累计退款金额' });
        return;
      }
      const replayed = refundCents === prior.refundCents;
      prior.refundCents = refundCents;
      reply(res, 200, {
        order: { orderRef: input.orderRef, refundCents, full: refundCents === prior.paidCents },
        replayed
      });
      return;
    }

    reply(res, 404, { error: 'NOT_FOUND', message: '接口不存在' });
  };

  const server: Server = createServer((req, res) => {
    void handler(req, res).catch(() => {
      if (!res.headersSent) reply(res, 500, { error: 'SERVER_ERROR' });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  state.url = `http://127.0.0.1:${address.port}`;
  state.close = () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  return state;
}
