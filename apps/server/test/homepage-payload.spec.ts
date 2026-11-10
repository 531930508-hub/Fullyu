// ali-oss 是 ESM 包，单测里用空实现替代，避免加载真实 SDK。
jest.mock('ali-oss', () => ({ __esModule: true, default: class OSS {} }))

import { of } from 'rxjs'
import { ImageUrlInterceptor } from '../src/common/interceptors/image-url.interceptor'
import { OrderService } from '../src/modules/order/order.service'

/** Prisma Decimal 是类实例，响应拦截器不能把它展开成 { s, e, d }。 */
class FakeDecimal {
  constructor(
    public s: number,
    public e: number,
    public d: number[],
  ) {}
  toJSON() {
    return String(this.d[0])
  }
}

function buildInterceptor() {
  const storage = {
    resolveImageRef: jest.fn((value: string, _expires?: number, process?: string) =>
      `signed(${value}${process ? `|${process}` : ''})`,
    ),
  }
  const interceptor = new ImageUrlInterceptor(storage as any)
  const run = (data: any) =>
    new Promise<any>((resolve) => {
      interceptor.intercept({} as any, { handle: () => of(data) }).subscribe(resolve)
    })
  return { interceptor, storage, run }
}

describe('首页响应瘦身与图片签名', () => {
  it('保留 Prisma Decimal 实例，避免价格被序列化成对象后前端显示 NaN', async () => {
    const price = new FakeDecimal(1, 4, [38000])
    const { run } = buildInterceptor()
    const result = await run({ id: 'c1', originalPrice: price, venue: { name: '总店' } })
    expect(result.originalPrice).toBe(price)
    expect(JSON.parse(JSON.stringify(result)).originalPrice).toBe('38000')
  })

  it('封面/头像走缩略参数，个人照片保持原图', async () => {
    const { run, storage } = buildInterceptor()
    const result = await run({
      coverImage: 'course/a.jpg',
      avatar: 'user/a.jpg',
      photo: 'user/photo.jpg',
      contractUrl: 'contract/a.pdf',
    })
    expect(result.coverImage).toBe('signed(course/a.jpg|image/resize,w_1080/quality,q_82)')
    expect(result.avatar).toBe('signed(user/a.jpg|image/resize,w_200/quality,q_80)')
    expect(result.photo).toBe('signed(user/photo.jpg)')
    expect(result.contractUrl).toBe('signed(contract/a.pdf)')
    expect(storage.resolveImageRef).toHaveBeenCalledTimes(4)
  })

  it('图集 JSON 字符串逐项签名', async () => {
    const { run } = buildInterceptor()
    const result = await run({ gallery: JSON.stringify(['course/a.jpg', 'course/b.jpg']) })
    expect(JSON.parse(result.gallery)).toEqual([
      'signed(course/a.jpg|image/resize,w_1200/quality,q_85)',
      'signed(course/b.jpg|image/resize,w_1200/quality,q_85)',
    ])
  })
})

describe('首页下一场课程', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-29T07:00:00.000Z')) // 东八区 15:00
  })
  afterEach(() => jest.useRealTimers())

  it('按东八区日期+时间取最近一场已支付课程', async () => {
    const findMany = jest.fn().mockResolvedValue([
      // 东八区 10-30 09:00
      { id: 'b', course: { title: '明天', startDate: new Date('2026-10-29T16:00:00.000Z'), startTime: '09:00' } },
      // 东八区 10-29 20:00（今天稍晚，应排第一）
      { id: 'today', course: { title: '今晚', startDate: new Date('2026-10-28T16:00:00.000Z'), startTime: '20:00' } },
      // 东八区 10-31 19:30
      { id: 'c', course: { title: '后天', startDate: new Date('2026-10-30T16:00:00.000Z'), startTime: '19:30' } },
    ])
    const service = new OrderService({ order: { findMany } } as any, {} as any, {} as any)
    const result = await service.findNextCourse('u1')
    expect(result?.id).toBe('today')
    expect(findMany.mock.calls[0][0].where.course.startDate.gte.toISOString()).toBe('2026-10-28T16:00:00.000Z')
  })

  it('当天更早的课程不再返回', async () => {
    const findMany = jest.fn().mockResolvedValue([
      // 东八区 10-29 10:00，已经过去
      { id: 'past', course: { title: '上午', startDate: new Date('2026-10-28T16:00:00.000Z'), startTime: '10:00' } },
    ])
    const service = new OrderService({ order: { findMany } } as any, {} as any, {} as any)
    await expect(service.findNextCourse('u1')).resolves.toBeNull()
  })
})
