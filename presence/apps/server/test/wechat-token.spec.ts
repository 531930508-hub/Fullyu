import { WechatService } from '../src/common/wechat/wechat.service'

/**
 * 正式机与测试机共用同一 appid：必须走 stable_token，且 40001 时要清缓存重试一次，
 * 否则消息会被悄悄丢掉。
 */
describe('微信 access_token 与订阅消息重试', () => {
  function build(cached: string | null = null) {
    const config = { get: jest.fn((_k: string, d?: string) => d ?? '') }
    const redis = {
      get: jest.fn().mockResolvedValue(cached),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    }
    const service = new WechatService(config as any, redis as any)
    return { service, redis, config }
  }

  afterEach(() => jest.restoreAllMocks())

  it('缓存为空时用 stable_token 取 token 并写缓存', async () => {
    const { service, redis } = build(null)
    const fetchMock = jest
      .spyOn(global, 'fetch' as any)
      .mockResolvedValue({ json: async () => ({ access_token: 'tok-1', expires_in: 7200 }) } as any)
    await expect(service.getAccessToken()).resolves.toBe('tok-1')
    expect(fetchMock.mock.calls[0][0]).toContain('/cgi-bin/stable_token')
    expect(redis.set).toHaveBeenCalledWith('wechat:access_token', 'tok-1', 6900)
  })

  it('40001 时清缓存重取并重发一次', async () => {
    const { service, redis } = build(null)
    const fetchMock = jest
      .spyOn(global, 'fetch' as any)
      .mockResolvedValueOnce({ json: async () => ({ access_token: 'tok-old', expires_in: 7200 }) } as any)
      .mockResolvedValueOnce({ json: async () => ({ errcode: 40001, errmsg: 'invalid credential' }) } as any)
      .mockResolvedValueOnce({ json: async () => ({ access_token: 'tok-new', expires_in: 7200 }) } as any)
      .mockResolvedValueOnce({ json: async () => ({ errcode: 0, errmsg: 'ok' }) } as any)
    const ok = await service.sendSubscribeMessage({
      openid: 'o1',
      templateId: 't1',
      data: { thing1: { value: '晨间瑜伽' } },
      page: 'pages/a',
    })
    expect(ok).toBe(true)
    expect(redis.del).toHaveBeenCalledWith('wechat:access_token')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('用户未授权（43101）返回 false，不重试', async () => {
    const { service } = build('tok-cached')
    const fetchMock = jest
      .spyOn(global, 'fetch' as any)
      .mockResolvedValue({ json: async () => ({ errcode: 43101, errmsg: 'user refuse to accept the msg' }) } as any)
    await expect(
      service.sendSubscribeMessage({ openid: 'o1', templateId: 't1', data: {} }),
    ).resolves.toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
