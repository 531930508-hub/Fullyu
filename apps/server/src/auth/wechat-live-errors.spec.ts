/**
 * 真实微信适配层的错误映射。
 * 微信拒绝（code 过期、频率限制、凭证/网络异常）必须以可读的业务错误返回，
 * 不能落到 500「服务暂时不可用」，也不能把微信原始 errcode 抛给顾客。
 */
import { WechatMiniProgramAuth } from '@teahour/integrations';
import { ApiError } from '../common/errors';
import { AuthService } from './auth.service';

type Json = Record<string, unknown>;

const respond = (body: Json): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

function service(fetchImpl: typeof fetch) {
  const wechat = new WechatMiniProgramAuth({
    appId: 'wxtest0000000000',
    appSecret: 'test-secret',
    paymentMode: 'mock',
    apiBase: 'https://wechat.test',
    fetchImpl,
    quotaRetryDelayMs: 0
  });
  return new AuthService({} as never, {} as never, {} as never, { wechat } as never);
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    return error as ApiError;
  }
  throw new Error('预期失败，但请求成功了');
}

describe('真实微信登录的错误映射', () => {
  it('登录 code 过期映射为 400，且不暴露微信原始错误', async () => {
    const auth = service(async () => respond({ errcode: 40029, errmsg: 'invalid code, rid: abc' }));
    const error = await failure(auth.createWechatSession({ code: 'stale-code' }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('登录信息已过期，请重新登录');
    expect(error.message).not.toMatch(/40029|invalid/);
  });

  it('手机号授权 code 过期映射为 400 并提示重新授权', async () => {
    const auth = service(async (input) => {
      const url = String(input);
      if (url.includes('jscode2session')) return respond({ openid: 'openid-1' });
      if (url.includes('stable_token')) return respond({ access_token: 'token-1', expires_in: 7200 });
      return respond({ errcode: 40029, errmsg: 'invalid code' });
    });
    const error = await failure(auth.createWechatSession({ code: 'code-1', phoneCode: 'stale-phone' }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('手机号授权已过期，请重新授权');
  });

  it('AppSecret 无效或 access_token 获取失败映射为 503，不冒充登录成功', async () => {
    const auth = service(async (input) => {
      const url = String(input);
      if (url.includes('jscode2session')) return respond({ openid: 'openid-1' });
      return respond({ errcode: 40125, errmsg: 'invalid appsecret' });
    });
    const error = await failure(auth.createWechatSession({ code: 'code-1', phoneCode: 'phone-1' }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.statusCode).toBe(503);
    expect(error.message).toBe('登录服务暂时不可用，请稍后重试');
    expect(error.message).not.toMatch(/40125|appsecret/i);
  });

  it('微信接口网络异常映射为 503', async () => {
    const auth = service(async () => {
      throw new TypeError('fetch failed');
    });
    const error = await failure(auth.createWechatSession({ code: 'code-1' }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.statusCode).toBe(503);
    expect(error.message).toBe('登录服务暂时不可用，请稍后重试');
  });

  it('微信频率限制映射为 429，提示稍后再试', async () => {
    const auth = service(async () => respond({ errcode: 45011, errmsg: 'api minute-quota reach limit' }));
    const error = await failure(auth.createWechatSession({ code: 'code-1' }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.statusCode).toBe(429);
    expect(error.message).toBe('操作过于频繁，请稍后再试');
  });
});

/**
 * 45011 是微信分钟级配额，属于瞬时抖动：一次退避重试通常就能恢复。
 * 审核人员在「选好了」反复操作时不应该直接看到「操作太频繁」。
 */
describe('微信瞬时限流的一次重试', () => {
  const provider = (fetchImpl: typeof fetch) =>
    new WechatMiniProgramAuth({
      appId: 'wxtest0000000000',
      appSecret: 'test-secret',
      paymentMode: 'mock',
      apiBase: 'https://wechat.test',
      fetchImpl,
      quotaRetryDelayMs: 0
    });

  it('jscode2session 首次遇到 45011 时重试一次，成功返回登录态', async () => {
    let calls = 0;
    const wechat = provider(async () => {
      calls += 1;
      return calls === 1
        ? respond({ errcode: 45011, errmsg: 'api minute-quota reach limit' })
        : respond({ openid: 'openid-retry' });
    });

    const session = await wechat.code2Session('code-1');

    expect(session.openId).toBe('openid-retry');
    expect(calls).toBe(2);
  });

  it('getuserphonenumber 首次遇到 45011 时重试一次，成功返回手机号', async () => {
    let phoneCalls = 0;
    const wechat = provider(async (input) => {
      const url = String(input);
      if (url.includes('stable_token')) return respond({ access_token: 'token-1', expires_in: 7200 });
      phoneCalls += 1;
      return phoneCalls === 1
        ? respond({ errcode: 45011, errmsg: 'api minute-quota reach limit' })
        : respond({ phone_info: { purePhoneNumber: '13800138000', countryCode: '86' } });
    });

    const result = await wechat.phoneNumber({ openId: 'openid-1', code: 'phone-code' });

    expect(result.phone).toBe('13800138000');
    expect(phoneCalls).toBe(2);
  });

  it('持续 45011 时只重试一次，仍如实把错误交给上层', async () => {
    let calls = 0;
    const wechat = provider(async () => {
      calls += 1;
      return respond({ errcode: 45011, errmsg: 'api minute-quota reach limit' });
    });

    const error = await failure(wechat.code2Session('code-1'));

    expect(calls).toBe(2);
    expect(error.message).toMatch(/45011/);
  });
});
