import { ApiError } from '../common/errors';
import { startFakeCrm, type FakeCrm } from '../testing/crm-fake';
import { CrmClient } from './crm.client';

const ENV_KEYS = [
  'CRM_ENABLED',
  'CRM_BASE_URL',
  'CRM_KEY_ID',
  'CRM_SECRET',
  'CRM_TIMEOUT_MS'
] as const;

const saved: Record<string, string | undefined> = {};

describe('CrmClient', () => {
  let fake: FakeCrm;

  beforeAll(() => {
    for (const key of ENV_KEYS) saved[key] = process.env[key];
  });

  afterAll(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  beforeEach(async () => {
    fake = await startFakeCrm({ keyId: 'teahour-test', secret: 'test-secret-0123456789' });
    process.env.CRM_ENABLED = '1';
    process.env.CRM_BASE_URL = fake.url;
    process.env.CRM_KEY_ID = 'teahour-test';
    process.env.CRM_SECRET = 'test-secret-0123456789';
    process.env.CRM_TIMEOUT_MS = '800';
  });

  afterEach(async () => {
    await fake.close();
  });

  it('未开启时不发请求，明确告知未开启而不是伪造余额', async () => {
    delete process.env.CRM_BASE_URL;
    process.env.CRM_ENABLED = '0';
    const client = new CrmClient();
    expect(client.enabled).toBe(false);
    await expect(client.resolve({ localUserId: 'C1' })).rejects.toMatchObject({
      statusCode: 503,
      code: 'CRM_DISABLED'
    });
  });

  it('resolve 用契约签名请求，重复解析回到同一会员', async () => {
    const client = new CrmClient();
    const first = await client.resolve({
      localUserId: 'C100',
      phone: '13900000001',
      name: '签名茶客',
      gender: 2,
      birthday: '1994-05-18'
    });
    expect(first.created).toBe(true);
    expect(first.memberNo).toMatch(/^FY-TEST-\d{6}$/);
    expect(first.balance).toBe(0);

    const again = await client.resolve({ localUserId: 'C100', phone: '13900000001' });
    expect(again.memberId).toBe(first.memberId);

    expect(fake.requests).toHaveLength(2);
    expect(fake.requests.every((item) => item.signatureOk)).toBe(true);
    expect(fake.requests[0].path).toBe('/api/external/members/resolve');
    const body = JSON.parse(fake.requests[0].body) as Record<string, unknown>;
    // 业务端只传本地标识与档案字段，不传业务键（业务归属由密钥决定）。
    expect(body).toMatchObject({ localUserId: 'C100', phone: '13900000001', name: '签名茶客' });
    expect(body).not.toHaveProperty('business');
  });

  it('只读查询返回 CRM 余额；未同步时返回 null', async () => {
    const client = new CrmClient();
    const member = await client.resolve({ localUserId: 'C200', name: '余额茶客' });
    fake.members.get('C200')!.balance = 388;

    await expect(client.getByLocalUser('C200')).resolves.toMatchObject({
      memberId: member.memberId,
      balance: 388
    });
    await expect(client.getByLocalUser('C999')).resolves.toBeNull();
  });

  it('身份冲突透传为 409，由顾客联系客服人工合并', async () => {
    const client = new CrmClient();
    fake.failNext = {
      status: 409,
      body: { error: 'CONFLICT', message: '内部细节不应透出', details: { code: 'IDENTITY_CONFLICT' } }
    };
    await expect(client.resolve({ localUserId: 'C300' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'IDENTITY_CONFLICT'
    });
  });

  it('服务端故障与超时都收敛为 503，不把内部错误甩给顾客', async () => {
    const client = new CrmClient();
    fake.failNext = { status: 500, body: { error: 'SERVER_ERROR', message: 'stacktrace' } };
    const failure = await client.resolve({ localUserId: 'C400' }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ statusCode: 503, code: 'CRM_UNAVAILABLE' });
    expect((failure as Error).message).not.toMatch(/stacktrace/);

    fake.delayMs = 1200;
    await expect(client.resolve({ localUserId: 'C401' })).rejects.toMatchObject({
      statusCode: 503,
      code: 'CRM_UNAVAILABLE'
    });
  });
});
