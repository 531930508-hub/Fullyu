/**
 * 微信小程序适配层（mock）：手机号登录、手机号授权、JSAPI 支付参数。
 * 业务约束：手机号是顾客唯一身份，没有手机号就没有登录态，也不存在「先登录后补绑」。
 */
import { createHarness, freshOrderBody, type Harness } from '../testing/harness';

describe('小程序微信能力适配层', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  it('wx.login + 微信手机号授权换取会话，手机号写入档案', async () => {
    const res = await h.api('post', '/customer/wechat/login', null, {
      code: 'code-aaa',
      phone: '13700000001',
      name: '微信茶客'
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.provider).toBe('mock');
    expect(res.body.customer.phone).toBe('13700000001');
    expect(res.body.customer.memberCode).toMatch(/^TH-/);

    const saved = await h.prisma.customer.findUnique({ where: { id: res.body.customer.id } });
    expect(saved?.openId).toMatch(/^mock_/);
    expect(saved?.phone).toBe('13700000001');
  });

  it('同一手机号换一次微信授权仍复用同一顾客', async () => {
    const first = await h.api('post', '/customer/wechat/login', null, {
      code: 'code-bbb',
      phone: '13700000002'
    });
    const again = await h.api('post', '/customer/wechat/login', null, {
      code: 'code-bbb-second',
      phone: '13700000002',
      name: '换设备登录'
    });
    expect(again.status).toBe(201);
    expect(again.body.customer.id).toBe(first.body.customer.id);
    expect(again.body.customer.memberCode).toBe(first.body.customer.memberCode);

    const saved = await h.prisma.customer.findUnique({ where: { id: first.body.customer.id } });
    // openId 跟随最近一次微信授权更新，身份仍由手机号锚定。
    expect(saved?.openId).toMatch(/^mock_/);
    expect(saved?.openId).not.toBe(
      (await h.prisma.customer.findUnique({ where: { phone: '13700000001' } }))?.openId
    );
  });

  it('没有手机号不能登录', async () => {
    const res = await h.api('post', '/customer/wechat/login', null, { code: 'code-no-phone' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/手机号/);

    const empty = await h.api('post', '/customer/session', null, { name: '匿名茶客' });
    expect(empty.status).toBe(400);
  });

  it('手机号格式不合法被拒绝', async () => {
    const res = await h.api('post', '/customer/wechat/login', null, {
      code: 'code-bad-phone',
      phone: '12345'
    });
    expect(res.status).toBe(400);
  });

  it('getPhoneNumber 的 code 由适配层换成手机号并直接建立会话', async () => {
    const login = await h.api('post', '/customer/wechat/login', null, {
      code: 'code-phone',
      phoneCode: 'phone-code'
    });
    expect(login.status).toBe(201);
    expect(login.body.customer.phone).toMatch(/^1\d{10}$/);

    const saved = await h.prisma.customer.findUnique({ where: { id: login.body.customer.id } });
    expect(saved?.phone).toBe(login.body.customer.phone);
  });

  it('已绑定手机号的会话不能改绑他人手机号，未登录不能绑定', async () => {
    const login = await h.api('post', '/customer/wechat/login', null, {
      code: 'code-rebind',
      phone: '13700000003'
    });
    const again = await h.api('post', '/customer/wechat/phone', login.body.token, { code: 'phone-code' });
    expect(again.status).toBe(400);
    expect(again.body.message).toMatch(/手机号/);

    const anonymous = await h.api('post', '/customer/wechat/phone', null, { code: 'phone-code' });
    expect(anonymous.status).toBe(401);
  });

  it('订单可取到 wx.requestPayment 所需参数，且只能取自己的订单', async () => {
    const mine = await h.api('post', '/customer/wechat/login', null, {
      code: 'code-pay',
      phone: '13700000004'
    });
    const order = await h.api('post', '/customer/orders', mine.body.token, freshOrderBody());
    expect(order.status).toBe(201);

    const pay = await h.api('post', `/customer/orders/${order.body.order.id}/prepay`, mine.body.token);
    expect(pay.status).toBe(201);
    expect(pay.body.mode).toBe('mock');
    expect(pay.body.payment.package).toMatch(/^prepay_id=/);
    expect(pay.body.payment.signType).toBe('RSA');
    expect(pay.body.payment.paySign).toBeTruthy();

    const stranger = await h.customer('路过茶客');
    const denied = await h.api('post', `/customer/orders/${order.body.order.id}/prepay`, stranger.token);
    expect(denied.status).toBe(404);
  });

  it('mock 环境不伪造分享小程序码，明确告知未实现', async () => {
    const res = await h.api('get', '/customer/share/code', null);

    expect(res.status).toBe(501);
    expect(res.body.message).toMatch(/小程序码/);
  });
});
