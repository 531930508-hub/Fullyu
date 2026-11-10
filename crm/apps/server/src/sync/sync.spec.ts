import { createHash, createHmac } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { ACCOUNTS, createHarness, type Harness } from '../testing/harness';

const SECRETS = {
  'ql-test': { business: 'ql', secret: 'ql-secret-for-jest-0001' },
  'sx-test': { business: 'sx', secret: 'sx-secret-for-jest-0002' },
  'zc-test': { business: 'zc', secret: 'zc-secret-for-jest-0003' }
} as const;

type KeyName = keyof typeof SECRETS;

process.env.CRM_EXT_KEYS = JSON.stringify(SECRETS);
process.env.CRM_GAME_URL = 'https://game.test/play';
process.env.CRM_OUTBOX_MAX_ATTEMPTS = '1';

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

type Received = { path: string; headers: http.IncomingHttpHeaders; body: string };

describe('CRM 1C 收尾：outbox 投递、同步滞后与异常队列', () => {
  let h: Harness;
  let ops: string;
  let finance: string;
  let cs: string;
  let nonceSeq = 0;
  let receiver: http.Server;
  let received: Received[] = [];
  let failNext = false;
  let baseUrl = '';

  beforeAll(async () => {
    receiver = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('end', () => {
        received.push({
          path: req.url || '',
          headers: req.headers,
          body: Buffer.concat(chunks).toString('utf8')
        });
        if (failNext) {
          failNext = false;
          res.writeHead(500);
          res.end('fail');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      });
    });
    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/hooks/crm`;

    h = await createHarness();
    ops = await h.login(ACCOUNTS.ops);
    finance = await h.login(ACCOUNTS.finance);
    cs = await h.login(ACCOUNTS.cs);
    await h.prisma.memberIdentity.create({
      data: {
        id: 'id-sync-lin-ql',
        business: 'ql',
        localUserId: 'local-sync-lin-ql',
        memberId: 'm-lin'
      }
    });
    process.env.CRM_EXT_WEBHOOKS = JSON.stringify({ ql: baseUrl });
  });

  afterAll(async () => {
    delete process.env.CRM_EXT_WEBHOOKS;
    await h.close();
    await new Promise<void>((resolve) => receiver.close(() => resolve()));
  });

  const server = () => h.app.getHttpServer();
  const nonce = () => `s-${Date.now()}-${++nonceSeq}`;

  const signed = (
    method: 'get' | 'post',
    url: string,
    options: { body?: unknown; key?: KeyName } = {}
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
    if (options.body !== undefined) {
      req = req.set('Content-Type', 'application/json').send(options.body as object);
    }
    return req;
  };

  const issueAnnual = async (orderRef: string) => {
    const quote = await signed('post', '/v1/brand-member/quote', {
      body: {
        business: 'teahour',
        localUserId: 'local-m-lin',
        productCode: 'FY_ANNUAL'
      }
    });
    expect(quote.status).toBe(201);
    const issued = await signed('post', '/v1/brand-member/issue', {
      body: {
        quoteId: quote.body.quoteId,
        orderRef,
        paidCents: quote.body.priceCents,
        paidAt: new Date(Date.now() - 60000).toISOString()
      }
    });
    expect(issued.status).toBe(201);
    return issued.body;
  };

  it('开卡写入 outbox；按业务配置投递，未配置业务跳过；同步状态记录拉取时间', async () => {
    const me = await signed('get', '/v1/brand-member/me?business=teahour&localUserId=local-m-lin');
    expect(me.status).toBe(200);
    const meQl = await signed(
      'get',
      '/v1/brand-member/me?business=retreat&localUserId=local-sync-lin-ql',
      { key: 'ql-test' }
    );
    expect(meQl.status).toBe(200);

    const card = await issueAnnual('TH-SYNC-0001');
    const events = await h.prisma.outboxEvent.findMany({
      where: { memberId: 'm-lin', topic: 'brand_card.issued' }
    });
    expect(events.map((row) => row.business).sort()).toEqual(['ql', 'sx']);
    expect(events.every((row) => row.status === 'PENDING')).toBe(true);

    const status = await h.api('get', '/sync/status', finance);
    expect(status.status).toBe(200);
    const ql = status.body.businesses.find((b: { business: string }) => b.business === 'retreat');
    const sx = status.body.businesses.find((b: { business: string }) => b.business === 'teahour');
    expect(ql.webhookConfigured).toBe(true);
    expect(ql.lastSeenAt).toBeTruthy();
    expect(ql.pending).toBeGreaterThanOrEqual(1);
    expect(sx.webhookConfigured).toBe(false);
    expect(sx.pending).toBeGreaterThanOrEqual(1);

    const run = await h.api('post', '/sync/run', ops, {});
    expect(run.status).toBe(200);
    expect(run.body.delivered).toBeGreaterThanOrEqual(1);
    expect(run.body.skipped).toBeGreaterThanOrEqual(1);

    expect(received).toHaveLength(1);
    expect(received[0].path).toBe('/hooks/crm');
    expect(received[0].headers['x-fy-signature']).toBeTruthy();
    expect(received[0].headers['x-fy-key']).toBeTruthy();
    const payload = JSON.parse(received[0].body);
    expect(payload.topic).toBe('brand_card.issued');
    expect(payload.memberNo).toBe('FY-2602-008812');
    expect(payload.cardId).toBe(card.card.cardId);

    const delivered = await h.prisma.outboxEvent.findFirstOrThrow({
      where: { memberId: 'm-lin', business: 'ql', topic: 'brand_card.issued' }
    });
    expect(delivered.status).toBe('DELIVERED');
    expect(delivered.deliveredAt).toBeTruthy();
  });

  it('投递失败进入异常队列；重投成功后清除；无权限角色被拒', async () => {
    failNext = true;
    const before = received.length;
    await issueAnnual('TH-SYNC-0002');
    const run = await h.api('post', '/sync/run', ops, {});
    expect(run.status).toBe(200);
    expect(received.length).toBe(before + 1);

    const failed = await h.prisma.outboxEvent.findFirstOrThrow({
      where: { memberId: 'm-lin', business: 'ql', status: 'FAILED' }
    });
    expect(failed.attempts).toBe(1);
    expect(failed.lastError).toContain('500');

    const queue = await h.api('get', '/queue', finance);
    expect(queue.status).toBe(200);
    expect(queue.body.items.some((item: { id: string }) => item.id === failed.id)).toBe(true);

    const denied = await h.api('post', `/queue/${failed.id}/retry`, cs, {});
    expect(denied.status).toBe(403);

    const retried = await h.api('post', `/queue/${failed.id}/retry`, finance, {});
    expect(retried.status).toBe(200);
    expect(retried.body.status).toBe('PENDING');
    expect(retried.body.attempts).toBe(0);

    const again = await h.api('post', '/sync/run', ops, {});
    expect(again.status).toBe(200);
    expect(again.body.delivered).toBeGreaterThanOrEqual(1);

    const remaining = await h.api('get', '/queue', finance);
    expect(remaining.body.items).toHaveLength(0);

    const deniedSync = await h.api('get', '/sync/status', cs);
    expect(deniedSync.status).toBe(403);
  });
});
