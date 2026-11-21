import { NotificationService } from '../src/common/notification/notification.service'

/**
 * 心愿通知模板「活动报名开始提醒」：thing1 活动名称 / time2 报名开始时间 /
 * time3 活动开始时间 / thing5 温馨提示。字段名与微信模板不一致会整条被拒（47003）。
 */
describe('课程心愿订阅消息字段', () => {
  function build() {
    const config = {
      get: jest.fn((key: string) => (key === 'WECHAT_TMPL_COURSE_WISH' ? 'tmpl-wish' : '')),
    }
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue({ openId: 'openid-1' }) } }
    const wechat = { sendSubscribeMessage: jest.fn().mockResolvedValue(undefined) }
    const service = new NotificationService(config as any, prisma, wechat as any)
    return { service, wechat }
  }

  it('按模板字段下发 thing1/time2/time3/thing5，thing 超长截断到 20 字', async () => {
    const { service, wechat } = build()
    const delivered = await service.courseWishReleased('u1', {
      courseName: '城市微度假·正念呼吸与身体扫描深度体验工作坊特别场',
      enrollAt: new Date(2026, 10, 21, 18, 0, 0),
      startAt: new Date(2026, 10, 23, 10, 30, 0),
      courseId: 'c1',
    })
    expect(delivered).toBe(true)
    const payload = wechat.sendSubscribeMessage.mock.calls[0][0]
    expect(payload.templateId).toBe('tmpl-wish')
    expect(payload.page).toBe('/pages/course-detail/index?id=c1')
    expect(Object.keys(payload.data).sort()).toEqual(['thing1', 'thing5', 'time2', 'time3'])
    expect(payload.data.thing1.value).toHaveLength(20)
    expect(payload.data.time2.value).toBe('2026年11月21日 18:00')
    expect(payload.data.time3.value).toBe('2026年11月23日 10:30')
    expect(payload.data.thing5.value).toBe('你许愿的课程开新班了，名额有限')
  })

  it('模板未配置时不下发、返回 false（心愿不被标记）', async () => {
    const { service, wechat } = build()
    ;(service as any).config.get = jest.fn(() => '')
    const delivered = await service.courseWishReleased('u1', {
      courseName: '晨间瑜伽',
      enrollAt: new Date(2026, 10, 21, 18, 0, 0),
      startAt: new Date(2026, 10, 23, 10, 30, 0),
      courseId: 'c1',
    })
    expect(delivered).toBe(false)
    expect(wechat.sendSubscribeMessage).not.toHaveBeenCalled()
  })
})
