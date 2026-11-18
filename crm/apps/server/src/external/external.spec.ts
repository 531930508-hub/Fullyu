import request from 'supertest';
import { ACCOUNTS, createHarness, type Harness } from '../testing/harness';
import { signPayload } from './external.guard';

const SECRETS = {
  'ql-test': { business: 'ql', secret: 'ql-secret-for-jest-0001' },
  'sx-test': { business: 'sx', secret: 'sx-secret-for-jest-0002' },
  'zc-test': { business: 'zc', secret: 'zc-secret-for-jest-0003' }
};

process.env.CRM_EXT_KEYS = JSON.stringify(SECRETS);

type Method = 'get' | 'post';

describe('CRM 1C：业务端签名接口、身份与积分', () => {
  let h: Harness;
  let admin: string;

  beforeAll(async () => {
    h = await createHarness();
    admin = await h.login(ACCOUNTS.admin);
  });

  afterAll(async () => {
    await h.close();
  });

  const server = () => h.app.getHttpServer();

  const signed = (
    method: Method,
    url: string,
    options: {
      body?: unknown;
      key?: keyof typeof SECRETS | 'unknown';
      timestamp?: number;
      signature?: string;
    } = {}
  ) => {
    const key = options.key || 'ql-test';
    const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
    const raw = options.body === undefined ? '' : JSON.stringify(options.body);
    const secret = key === 'unknown' ? 'whatever-secret' : SECRETS[key].secret;
    const signature =
      options.signature ?? signPayload(secret, timestamp, method, `/api${url}`, raw);
    let req = request(server())
      [method](`/api${url}`)
      .set('x-crm-key', key)
      .set('x-crm-timestamp', timestamp)
      .set('x-crm-signature', signature);
    if (options.body !== undefined) req = req.set('Content-Type', 'application/json').send(options.body as object);
    return req;
  };

  it('签名缺失、错误、过期与未知密钥均拒绝', async () => {
    const missing = await request(server()).post('/api/external/members/resolve').send({});
    expect(missing.status).toBe(401);

    const wrong = await signed('post', '/external/members/resolve', {
      body: { localUserId: 'ql-x' },
      signature: 'deadbeef'
    });
    expect(wrong.status).toBe(401);

    const stale = await signed('post', '/external/members/resolve', {
      body: { localUserId: 'ql-x' },
      timestamp: Math.floor(Date.now() / 1000) - 600
    });
    expect(stale.status).toBe(401);

    const unknown = await signed('get', '/external/members/ql-x', { key: 'unknown' });
    expect(unknown.status).toBe(401);
  });

  it('签名通过后刷新该端同步状态：只调会员/积分的端也算已接入', async () => {
    await h.prisma.businessSyncState.deleteMany({ where: { business: 'zc' } });
    const res = await signed('get', '/external/members/zc-not-exist', { key: 'zc-test' });
    expect(res.status).toBe(404);

    const state = await h.prisma.businessSyncState.findUniqueOrThrow({
      where: { business: 'zc' }
    });
    expect(state.lastPath).toBe('/api/external/members/zc-not-exist');
    expect(Date.now() - state.lastSeenAt.getTime()).toBeLessThan(5000);
  });

  it('身份解析：首次新建会员，重复调用同一会员', async () => {
    const body = {
      localUserId: 'ql-u-1',
      unionId: 'union-alpha',
      openId: 'open-ql-1',
      phone: '13700001111',
      name: '测试甲',
      gender: 2
    };
    const first = await signed('post', '/external/members/resolve', { body });
    expect(first.status).toBe(200);
    expect(first.body.created).toBe(true);
    expect(first.body.memberNo).toMatch(/^FY-\d{4}-\d{6}$/);
    expect(first.body.balance).toBe(0);

    const again = await signed('post', '/external/members/resolve', { body });
    expect(again.status).toBe(200);
    expect(again.body.created).toBe(false);
    expect(again.body.memberId).toBe(first.body.memberId);
    expect(again.body.memberNo).toBe(first.body.memberNo);
  });

  it('占位昵称可被真实昵称升级，真实昵称不会被占位昵称盖回', async () => {
    // 在场先登录：注册默认昵称「用户+手机号后四位」占住了档案
    const zc = await signed('post', '/external/members/resolve', {
      key: 'zc-test',
      body: { localUserId: 'zc-u-placeholder', phone: '13700007777', name: '用户7777' }
    });
    expect(zc.status).toBe(200);
    // 新建不再落占位昵称
    expect(zc.body.name).toBe('会员');

    // 模拟存量数据：老库里的名字是「用户+手机号后四位」
    await h.prisma.member.update({ where: { id: zc.body.memberId }, data: { name: '用户7777' } });

    // 轻疗随后解析同一手机号：真实昵称升级占位名
    const ql = await signed('post', '/external/members/resolve', {
      body: { localUserId: 'ql-u-real', phone: '13700007777', name: '昊昊昊' }
    });
    expect(ql.status).toBe(200);
    expect(ql.body.memberId).toBe(zc.body.memberId);
    expect(ql.body.name).toBe('昊昊昊');

    // 在场再登录：占位昵称不能把真实昵称盖回去
    const again = await signed('post', '/external/members/resolve', {
      key: 'zc-test',
      body: { localUserId: 'zc-u-placeholder', phone: '13700007777', name: '用户7777' }
    });
    expect(again.status).toBe(200);
    expect(again.body.name).toBe('昊昊昊');
  });

  it('带国际区号的旧占位名（用户+86…）也是占位名，可被真实昵称升级', async () => {
    const phone = '13700005555';
    const legacy = `用户+86${phone}`;
    const created = await signed('post', '/external/members/resolve', {
      body: { localUserId: 'ql-u-plus86', phone, name: legacy }
    });
    expect(created.body.name).toBe('会员');

    // 轻疗旧库确实存过「用户+86…」这种形状
    await h.prisma.member.update({ where: { id: created.body.memberId }, data: { name: legacy } });

    const real = await signed('post', '/external/members/resolve', {
      body: { localUserId: 'ql-u-plus86-real', phone, name: '青竹1234' }
    });
    expect(real.status).toBe(200);
    expect(real.body.name).toBe('青竹1234');
  });

  it('新建会员不落占位昵称，真实名之间的改写只走资料回写', async () => {
    const created = await signed('post', '/external/members/resolve', {
      body: { localUserId: 'ql-u-defaultname', phone: '13700006666', name: '用户6666' }
    });
    expect(created.status).toBe(200);
    expect(created.body.name).toBe('会员');

    // 另一端解析带来的另一个真实名不改写（resolve 不裁决谁的名字更好）
    const other = await signed('post', '/external/members/resolve', {
      body: { localUserId: 'ql-u-defaultname-2', phone: '13700006666', name: '小鹿4821' }
    });
    expect(other.status).toBe(200);
    expect(other.body.name).toBe('小鹿4821');

    const third = await signed('post', '/external/members/resolve', {
      body: { localUserId: 'ql-u-defaultname-3', phone: '13700006666', name: '另一个名字' }
    });
    expect(third.status).toBe(200);
    expect(third.body.name).toBe('小鹿4821');

    // 顾客自己改资料（资料回写接口）才是覆盖语义
    const edited = await signed('post', '/external/members/profile', {
      body: { localUserId: 'ql-u-defaultname-3', name: '第三个名字' }
    });
    expect(edited.status).toBe(200);
    expect(edited.body.name).toBe('第三个名字');
  });

  it('按本地用户批量读取生日，未同步用户忽略且按业务隔离', async () => {
    const created = await signed('post', '/external/members/resolve', {
      body: {
        localUserId: 'ql-u-birthday',
        phone: '13700008888',
        name: '生日会员',
        birthday: '1992-09-09'
      }
    });
    expect(created.status).toBe(200);

    const birthdays = await signed('post', '/external/members/birthdays', {
      body: { localUserIds: ['ql-u-birthday', 'ql-not-synced'] }
    });
    expect(birthdays.status).toBe(200);
    expect(birthdays.body.items).toEqual([
      { localUserId: 'ql-u-birthday', birthday: '1992-09-09' }
    ]);

    // 其它业务看不到这条身份，也就拿不到生日。
    const cross = await signed('post', '/external/members/birthdays', {
      key: 'sx-test',
      body: { localUserIds: ['ql-u-birthday'] }
    });
    expect(cross.status).toBe(200);
    expect(cross.body.items).toEqual([]);

    const invalid = await signed('post', '/external/members/birthdays', {
      body: { localUserIds: ['bad id!'] }
    });
    expect(invalid.status).toBe(400);
  });

  it('同一 unionId 跨业务命中同一会员，不重复建号', async () => {
    const resolved = await signed('post', '/external/members/resolve', {
      key: 'sx-test',
      body: { localUserId: 'sx-u-1', unionId: 'union-alpha', phone: '13700001111' }
    });
    expect(resolved.status).toBe(200);
    expect(resolved.body.created).toBe(false);
    expect(resolved.body.bound).toBe(true);

    const detail = await h.api('get', '/members?q=13700001111', admin);
    const matches = detail.body.members.filter((m: { name: string }) => m.name === '测试甲');
    expect(matches).toHaveLength(1);
  });

  it('unionId 与手机号分属不同会员时拒绝自动合并', async () => {
    const second = await signed('post', '/external/members/resolve', {
      body: { localUserId: 'ql-u-2', unionId: 'union-beta', phone: '13700002222', name: '测试乙' }
    });
    expect(second.status).toBe(200);

    const conflict = await signed('post', '/external/members/resolve', {
      body: { localUserId: 'ql-u-3', unionId: 'union-alpha', phone: '13700002222' }
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.details.code).toBe('IDENTITY_CONFLICT');
  });

  it('新建会员必须有手机号；本地用户查询按业务隔离', async () => {
    const created = await signed('post', '/external/members/resolve', {
      body: { localUserId: 'ql-u-nophone', name: '测试丙' }
    });
    expect(created.status).toBe(400);
    expect(created.body.message).toMatch(/手机号/);

    const own = await signed('get', '/external/members/ql-u-1');
    expect(own.status).toBe(200);

    const cross = await signed('get', '/external/members/ql-u-1', { key: 'sx-test' });
    expect(cross.status).toBe(404);

    const unknown = await signed('get', '/external/members/ql-nobody');
    expect(unknown.status).toBe(404);
  });

  it('已同步身份带脏手机号仍可解析，新建身份仍拒绝无效号码', async () => {
    const invalid = await signed('post', '/external/members/resolve', {
      body: { localUserId: 'ql-u-dirty', phone: '朱', name: '脏数据' }
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.message).toMatch(/手机号/);

    const valid = await signed('post', '/external/members/resolve', {
      body: { localUserId: 'ql-u-dirty2', phone: '13700009999', name: '已同步会员' }
    });
    expect(valid.status).toBe(200);

    // 历史脏数据不能挡住已同步身份；手机号仍以 CRM 档案为准。
    const replay = await signed('post', '/external/members/resolve', {
      body: { localUserId: 'ql-u-dirty2', phone: '朱' }
    });
    expect(replay.status).toBe(200);
    expect(replay.body.memberId).toBe(valid.body.memberId);
    const detail = await h.api('get', `/members/${valid.body.memberId}`, admin);
    expect(detail.body.member.phone).toBe('13700009999');
  });

  it('国际手机号按 E.164 建档，+86 写法归到同一大陆号码', async () => {
    const hk = await signed('post', '/external/members/resolve', {
      body: { localUserId: 'ql-u-hk', phone: '00852 9123 4567', name: '香港会员' }
    });
    expect(hk.status).toBe(200);
    expect(hk.body.created).toBe(true);

    const hkDetail = await signed('get', '/external/members/ql-u-hk');
    expect(hkDetail.status).toBe(200);
    const hkMember = await h.api('get', `/members/${hkDetail.body.memberId}`, admin);
    expect(hkMember.body.member.phone).toBe('+85291234567');

    const cn = await signed('post', '/external/members/resolve', {
      body: { localUserId: 'ql-u-cnplus', phone: '+86 137-0000-6666', name: '大陆会员' }
    });
    expect(cn.status).toBe(200);
    const cnMember = await h.api('get', `/members/${cn.body.memberId}`, admin);
    expect(cnMember.body.member.phone).toBe('13700006666');
  });

  it('积分入账与扣减：ref 幂等、同键异内容 409、余额不足 422', async () => {
    const earned = await signed('post', '/external/points/earn', {
      body: { localUserId: 'ql-u-1', points: 100, reason: '订单完成赠送', ref: 'order-1' }
    });
    expect(earned.status).toBe(200);
    expect(earned.body.balance).toBe(100);

    const replay = await signed('post', '/external/points/earn', {
      body: { localUserId: 'ql-u-1', points: 100, reason: '订单完成赠送', ref: 'order-1' }
    });
    expect(replay.status).toBe(200);
    expect(replay.body.ledgerId).toBe(earned.body.ledgerId);
    expect(replay.body.balance).toBe(100);

    const changed = await signed('post', '/external/points/earn', {
      body: { localUserId: 'ql-u-1', points: 50, reason: '订单完成赠送', ref: 'order-1' }
    });
    expect(changed.status).toBe(409);

    const consumed = await signed('post', '/external/points/consume', {
      body: { localUserId: 'ql-u-1', points: 30, reason: '下单抵扣', ref: 'order-2' }
    });
    expect(consumed.status).toBe(200);
    expect(consumed.body.balance).toBe(70);

    const tooMuch = await signed('post', '/external/points/consume', {
      body: { localUserId: 'ql-u-1', points: 1000, reason: '下单抵扣', ref: 'order-3' }
    });
    expect(tooMuch.status).toBe(422);

    const notSynced = await signed('post', '/external/points/earn', {
      body: { localUserId: 'ql-never', points: 10, reason: '测试', ref: 'order-4' }
    });
    expect(notSynced.status).toBe(404);
  });

  it('批量导入幂等：国际号码入库、缺手机号失败、已存在不变', async () => {
    const body = {
      members: [
        { localUserId: 'ql-imp-1', phone: '13700004444', name: '导入一' },
        { localUserId: 'ql-imp-2', phone: '+886 0976 106 846', name: '导入二' },
        { localUserId: 'ql-imp-3', name: '缺手机号' },
        { localUserId: 'ql-u-1' }
      ]
    };
    const first = await signed('post', '/external/members/import', { body });
    expect(first.status).toBe(200);
    expect(first.body.created).toBe(2);
    expect(first.body.unchanged).toBe(1);
    expect(first.body.failed).toHaveLength(1);
    expect(first.body.failed[0].localUserId).toBe('ql-imp-3');

    const again = await signed('post', '/external/members/import', { body });
    expect(again.body.created).toBe(0);
    expect(again.body.unchanged).toBe(3);
    expect(again.body.failed).toHaveLength(1);
  });

  it('资料回写：小程序编辑覆盖 CRM，未解析身份与非法值拒绝', async () => {
    await signed('post', '/external/members/resolve', {
      body: { localUserId: 'ql-profile-1', phone: '+8613800000301', name: '资料测试' }
    });

    const saved = await signed('post', '/external/members/profile', {
      body: {
        localUserId: 'ql-profile-1',
        name: '新昵称',
        gender: 2,
        birthday: '1996-03-08',
        avatarUrl: 'https://cdn.example.com/a.jpg'
      }
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({
      name: '新昵称',
      gender: 2,
      birthday: '1996-03-08',
      avatarUrl: 'https://cdn.example.com/a.jpg'
    });

    // 再改一次：覆盖已有值（resolve 的「只补空」语义在这里不适用）
    const again = await signed('post', '/external/members/profile', {
      body: { localUserId: 'ql-profile-1', gender: 1 }
    });
    expect(again.status).toBe(200);
    expect(again.body.gender).toBe(1);
    expect(again.body.profileVersion).toBeGreaterThan(saved.body.profileVersion);

    // 业务端回读：资料字段与版本号齐全，生日不因时区串日
    const pulled = await signed('get', '/external/members/ql-profile-1');
    expect(pulled.status).toBe(200);
    expect(pulled.body).toMatchObject({
      name: '新昵称',
      gender: 1,
      birthday: '1996-03-08',
      avatarUrl: 'https://cdn.example.com/a.jpg',
      profileVersion: again.body.profileVersion
    });

    const missing = await signed('post', '/external/members/profile', {
      body: { localUserId: 'ql-never-resolved', gender: 1 }
    });
    expect(missing.status).toBe(404);

    const invalid = await signed('post', '/external/members/profile', {
      body: { localUserId: 'ql-profile-1', birthday: '2999-01-01' }
    });
    expect(invalid.status).toBe(400);

    const empty = await signed('post', '/external/members/profile', {
      body: { localUserId: 'ql-profile-1' }
    });
    expect(empty.status).toBe(400);

    // 后台可见「改的是谁、从哪端改的」
    const audit = await h.api('get', '/audit?action=' + encodeURIComponent('修改会员资料'), admin);
    expect(audit.status).toBe(200);
    expect(audit.body.logs.length).toBeGreaterThanOrEqual(2);
  });

  it('外部写入留审计，积分不变量保持', async () => {
    const audit = await h.api('get', '/audit?action=' + encodeURIComponent('外部积分入账'), admin);
    expect(audit.status).toBe(200);
    expect(audit.body.logs.length).toBeGreaterThan(0);

    const member = await signed('get', '/external/members/ql-u-1');
    const detail = await h.api('get', `/members/${member.body.memberId}`, admin);
    const sum = await h.prisma.pointBatch.aggregate({
      where: { memberId: member.body.memberId, status: 'ACTIVE', expireAt: { gt: new Date() } },
      _sum: { remaining: true }
    });
    expect(detail.body.balance).toBe(70);
    expect(sum._sum.remaining).toBe(70);
    expect(detail.body.ledger[0].balanceAfter).toBe(70);
  });
});
