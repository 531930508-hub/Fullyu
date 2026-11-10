/**
 * 顾客个人资料维护：姓名、性别、生日与头像。
 * 字段口径与在场一致（gender 1=男 2=女 null=未填写，birthday 精确到日）。
 * 跨系统同步由 ProfileSyncProvider 承接，当前为占位实现，只校验业务代码的用法。
 */
import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_ROOT } from '../common/assets';
import { HardwareService } from '../hardware/hardware.module';
import { NoopProfileSync } from '@teahour/integrations';
import { createHarness, type Harness } from '../testing/harness';

// 1x1 PNG
const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

describe('顾客个人资料', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  it('会话返回资料字段，未填写时为空', async () => {
    const me = await h.customer('资料茶客');
    const res = await h.api('get', '/customer/me', me.token);
    expect(res.status).toBe(200);
    expect(res.body.customer.name).toBe('资料茶客');
    expect(res.body.customer.gender).toBeNull();
    expect(res.body.customer.birthday).toBeNull();
    expect(res.body.customer.avatarUrl).toBeNull();
  });

  it('GET /customer/me 回读完整档案，不丢头像与生日', async () => {
    const me = await h.customer('回读茶客');
    await h.api('put', '/customer/profile', me.token, { gender: 1, birthday: '1988-08-08' });
    await h.api('post', '/customer/avatar', me.token, { base64: PNG_1PX, contentType: 'image/png' });

    const res = await h.api('get', '/customer/me', me.token);
    expect(res.status).toBe(200);
    expect(res.body.customer.gender).toBe(1);
    expect(res.body.customer.birthday).toBe('1988-08-08');
    expect(res.body.customer.avatarUrl).toMatch(/\/uploads\/avatars\/.+\.png$/);

    const saved = await h.prisma.customer.findUnique({ where: { id: me.id } });
    fs.rmSync(path.join(UPLOAD_ROOT, saved!.avatarKey as string), { force: true });
  });

  it('可以一次更新姓名、性别与生日，并落库', async () => {
    const me = await h.customer('待改名');
    const res = await h.api('put', '/customer/profile', me.token, {
      name: '沈听雨',
      gender: 2,
      birthday: '1995-03-08'
    });
    expect(res.status).toBe(200);
    expect(res.body.customer.name).toBe('沈听雨');
    expect(res.body.customer.gender).toBe(2);
    expect(res.body.customer.birthday).toBe('1995-03-08');

    const saved = await h.prisma.customer.findUnique({ where: { id: me.id } });
    expect(saved?.name).toBe('沈听雨');
    expect(saved?.gender).toBe(2);
    expect(saved?.birthday?.toISOString().slice(0, 10)).toBe('1995-03-08');
  });

  it('只传一个字段时不会清空其他字段', async () => {
    const me = await h.customer('局部更新');
    await h.api('put', '/customer/profile', me.token, { gender: 1, birthday: '2000-01-01' });
    const res = await h.api('put', '/customer/profile', me.token, { name: '陆青' });
    expect(res.status).toBe(200);
    expect(res.body.customer.name).toBe('陆青');
    expect(res.body.customer.gender).toBe(1);
    expect(res.body.customer.birthday).toBe('2000-01-01');
  });

  it('显式传 null 可以清空性别与生日', async () => {
    const me = await h.customer('清空资料');
    await h.api('put', '/customer/profile', me.token, { gender: 1, birthday: '1990-06-06' });
    const res = await h.api('put', '/customer/profile', me.token, { gender: null, birthday: null });
    expect(res.status).toBe(200);
    expect(res.body.customer.gender).toBeNull();
    expect(res.body.customer.birthday).toBeNull();
  });

  it('姓名为空、超长或仅空白被拒绝', async () => {
    const me = await h.customer('校验姓名');
    const blank = await h.api('put', '/customer/profile', me.token, { name: '   ' });
    expect(blank.status).toBe(400);
    const tooLong = await h.api('put', '/customer/profile', me.token, { name: '茶'.repeat(13) });
    expect(tooLong.status).toBe(400);

    const saved = await h.prisma.customer.findUnique({ where: { id: me.id } });
    expect(saved?.name).toBe('校验姓名');
  });

  it('姓名里的换行被折成空格，不会写入多行', async () => {
    const me = await h.customer('换行姓名');
    const res = await h.api('put', '/customer/profile', me.token, { name: ' 林\n舟 ' });
    expect(res.status).toBe(200);
    expect(res.body.customer.name).toBe('林 舟');
  });

  it('性别只接受 1 / 2 / null', async () => {
    const me = await h.customer('校验性别');
    const res = await h.api('put', '/customer/profile', me.token, { gender: 3 });
    expect(res.status).toBe(400);
  });

  it('生日格式错误、未来日期或早于 1900 年被拒绝', async () => {
    const me = await h.customer('校验生日');
    expect((await h.api('put', '/customer/profile', me.token, { birthday: '1995/03/08' })).status).toBe(400);
    expect((await h.api('put', '/customer/profile', me.token, { birthday: '1995-02-30' })).status).toBe(400);
    expect((await h.api('put', '/customer/profile', me.token, { birthday: '1899-12-31' })).status).toBe(400);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const future = [
      tomorrow.getFullYear(),
      String(tomorrow.getMonth() + 1).padStart(2, '0'),
      String(tomorrow.getDate()).padStart(2, '0')
    ].join('-');
    expect((await h.api('put', '/customer/profile', me.token, { birthday: future })).status).toBe(400);
  });

  it('空请求体被拒绝', async () => {
    const me = await h.customer('空请求');
    const res = await h.api('put', '/customer/profile', me.token, {});
    expect(res.status).toBe(400);
  });

  it('未登录不能改资料', async () => {
    const res = await h.api('put', '/customer/profile', null, { name: '匿名' });
    expect(res.status).toBe(401);
  });

  it('头像上传后返回可访问地址，库里只存 key', async () => {
    const me = await h.customer('头像茶客');
    const res = await h.api('post', '/customer/avatar', me.token, {
      base64: `data:image/png;base64,${PNG_1PX}`,
      contentType: 'image/png'
    });
    expect(res.status).toBe(201);
    expect(res.body.customer.avatarUrl).toMatch(/\/uploads\/avatars\/.+\.png$/);

    const saved = await h.prisma.customer.findUnique({ where: { id: me.id } });
    expect(saved?.avatarKey).toMatch(/^avatars\/.+\.png$/);
    expect(fs.existsSync(path.join(UPLOAD_ROOT, saved!.avatarKey as string))).toBe(true);
    fs.rmSync(path.join(UPLOAD_ROOT, saved!.avatarKey as string), { force: true });
  });

  it('非 JPG/PNG 头像被拒绝', async () => {
    const me = await h.customer('格式校验');
    const res = await h.api('post', '/customer/avatar', me.token, {
      base64: PNG_1PX,
      contentType: 'image/gif'
    });
    expect(res.status).toBe(400);
  });

  it('超过 2MB 的头像被拒绝', async () => {
    const me = await h.customer('体积校验');
    const oversized = Buffer.alloc(2 * 1024 * 1024 + 1024, 1).toString('base64');
    const res = await h.api('post', '/customer/avatar', me.token, {
      base64: oversized,
      contentType: 'image/png'
    });
    expect(res.status).toBe(400);

    const saved = await h.prisma.customer.findUnique({ where: { id: me.id } });
    expect(saved?.avatarKey).toBeNull();
  });

  it('资料变更会推给跨系统同步 provider', async () => {
    const sync = h.app.get(HardwareService).profileSync as NoopProfileSync;
    const me = await h.customer('同步茶客');
    await h.api('put', '/customer/profile', me.token, { name: '叶知秋', gender: 2, birthday: '1992-09-09' });

    const pushed = sync.lastPushed();
    expect(pushed?.customerId).toBe(me.id);
    expect(pushed?.name).toBe('叶知秋');
    expect(pushed?.gender).toBe(2);
    expect(pushed?.birthday).toBe('1992-09-09');
    // 占位实现不对外取数，第三方用户中心接入后替换
    expect(await sync.pullProfile('13800000000')).toBeNull();
  });
});
