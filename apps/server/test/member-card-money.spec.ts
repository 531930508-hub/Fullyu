import { buildTestContext, Seeder, TestContext, payNotify, refundNotify } from './helpers'
import { MemberService } from '../src/modules/member/member.service'
import { HuifuPayService } from '../src/modules/payment/huifu-pay.service'
import { RedisService } from '../src/common/redis.service'
import { OrderTasksService } from '../src/modules/order/order-tasks.service'

/**
 * 会员卡资金链路：
 * - 商品价格以「元」存储，支付网关必须换算成分
 * - 短时间重复下单复用同一笔待支付订单
 * - 支付成功开卡 / 续期
 * - 用户取消已支付会员卡 → 全额退款（不能按课程规则算成 0 元）
 * - 整单退款撤销卡权益；续费退款只扣回本单时长
 * - 部分强制退款不回收卡片
 * - 待支付超时取消不产生会员卡
 */
describe('会员卡资金链路与权益回收', () => {
  let ctx: TestContext
  let seeder: Seeder
  let member: MemberService
  let orderTasks: OrderTasksService
  let huifu: any
  let productId: string

  function pngDataUrl(payloadBytes = 800) {
    const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const body = Buffer.concat([header, Buffer.alloc(payloadBytes, 0x01)])
    return `data:image/png;base64,${body.toString('base64')}`
  }

  beforeAll(async () => {
    ctx = await buildTestContext()
    seeder = new Seeder(ctx.prisma)
    member = new MemberService(ctx.prisma, ctx.moduleRef.get(RedisService))
    orderTasks = new OrderTasksService(ctx.prisma, ctx.moduleRef.get(RedisService))
    huifu = ctx.moduleRef.get(HuifuPayService)
    const product = await ctx.prisma.memberCardProduct.create({
      data: {
        type: 'MONTHLY',
        name: '测试月卡',
        price: 299,
        durationDays: 30,
        benefits: [],
        status: 'ON_SHELF',
        sort: 0,
      },
    })
    productId = product.id
  })

  afterAll(async () => {
    await seeder.cleanup()
    await ctx.prisma.memberCardProduct.deleteMany({ where: { id: productId } })
    await ctx.app.close()
  })

  const getOrder = (id: string) => ctx.prisma.order.findUnique({ where: { id } })

  it('同一商品短时间重复下单只保留一笔待支付订单', async () => {
    const user = await seeder.user()
    const first = await member.purchase(user.id, productId, pngDataUrl())
    const second = await member.purchase(user.id, productId, pngDataUrl())

    expect(second.orderId).toBe(first.orderId)
    expect((second as any).reused).toBe(true)
    expect(
      await ctx.prisma.order.count({
        where: { userId: user.id, orderType: 'MEMBER_CARD', status: 'PENDING_PAYMENT' },
      }),
    ).toBe(1)
  })

  it('支付金额按元→分换算，支付成功发卡 30 天', async () => {
    const user = await seeder.user({ openId: true })
    const { orderId } = await member.purchase(user.id, productId, pngDataUrl())

    const createSpy = jest.spyOn(huifu, 'createJsapiOrder')
    await ctx.payment.createPayment(orderId, user.id)
    expect(createSpy).toHaveBeenCalledTimes(1)
    expect((createSpy.mock.calls[0][0] as any).totalFen).toBe(29900)
    createSpy.mockRestore()

    await ctx.payment.handleNotify(payNotify(orderId, 'TX_CARD'))

    const order = await getOrder(orderId)
    expect(order!.status).toBe('PAID')
    expect(order!.memberCardId).toBeTruthy()
    const card = await ctx.prisma.memberCard.findUnique({ where: { id: order!.memberCardId! } })
    expect(card!.status).toBe('ACTIVE')
    const days = Math.round((card!.endDate.getTime() - card!.startDate.getTime()) / 86400000)
    expect(days).toBe(30)
    expect((await ctx.prisma.user.findUnique({ where: { id: user.id } }))!.photo).toContain(
      'data:image/png',
    )
  })

  it('取消已支付会员卡 → 全额退款并撤销会员卡', async () => {
    const user = await seeder.user({ openId: true })
    const { orderId } = await member.purchase(user.id, productId, pngDataUrl())
    await ctx.payment.fulfillPaidOrder(orderId, 'TX_CARD_REFUND')
    const cardId = (await getOrder(orderId))!.memberCardId!

    const refundSpy = jest.spyOn(huifu, 'refund')
    await ctx.order.cancelOrder(orderId, user.id, '买错了')

    const refunding = await getOrder(orderId)
    expect(refunding!.status).toBe('REFUNDING')
    expect(Number(refunding!.refundAmount)).toBe(299)
    expect(refundSpy).toHaveBeenCalledTimes(1)
    expect((refundSpy.mock.calls[0][0] as any).totalFen).toBe(29900)
    expect((refundSpy.mock.calls[0][0] as any).refundFen).toBe(29900)

    await ctx.payment.handleRefundNotify(refundNotify(orderId))
    expect((await getOrder(orderId))!.status).toBe('REFUNDED')
    const card = await ctx.prisma.memberCard.findUnique({ where: { id: cardId } })
    expect(card!.status).toBe('EXPIRED')
    refundSpy.mockRestore()
  })

  it('续费后退款只扣回本单时长，原有效期保留', async () => {
    const user = await seeder.user({ openId: true })
    const base = await seeder.memberCard(user.id, 'MONTHLY')
    const originalEnd = base.endDate.getTime()

    const { orderId } = await member.purchase(user.id, productId, pngDataUrl())
    await ctx.payment.fulfillPaidOrder(orderId, 'TX_CARD_RENEW')
    const extended = await ctx.prisma.memberCard.findUnique({ where: { id: base.id } })
    expect(extended!.endDate.getTime()).toBeGreaterThan(originalEnd)

    await ctx.order.cancelOrder(orderId, user.id, '续费退订')
    await ctx.payment.handleRefundNotify(refundNotify(orderId))

    const restored = await ctx.prisma.memberCard.findUnique({ where: { id: base.id } })
    expect(restored!.endDate.getTime()).toBe(originalEnd)
    expect(restored!.status).toBe('ACTIVE')
  })

  it('部分强制退款不回收会员卡', async () => {
    const user = await seeder.user({ openId: true })
    const { orderId } = await member.purchase(user.id, productId, pngDataUrl())
    await ctx.payment.fulfillPaidOrder(orderId, 'TX_CARD_PARTIAL')
    const cardId = (await getOrder(orderId))!.memberCardId!

    await ctx.payment.forceRefund(orderId, 100, '客诉补偿')
    const refunding = await getOrder(orderId)
    expect(refunding!.status).toBe('REFUNDING')
    expect(Number(refunding!.refundAmount)).toBe(100)

    await ctx.payment.handleRefundNotify(refundNotify(orderId))
    expect((await getOrder(orderId))!.status).toBe('REFUNDED')
    const card = await ctx.prisma.memberCard.findUnique({ where: { id: cardId } })
    expect(card!.status).toBe('ACTIVE')
  })

  it('待支付会员卡订单超时取消不产生会员卡', async () => {
    const user = await seeder.user()
    const { orderId } = await member.purchase(user.id, productId, pngDataUrl())
    await ctx.prisma.order.update({
      where: { id: orderId },
      data: { createdAt: new Date(Date.now() - 11 * 60 * 1000) },
    })

    await orderTasks.cancelExpiredOrders()

    expect((await getOrder(orderId))!.status).toBe('CANCELLED')
    expect(await ctx.prisma.memberCard.count({ where: { userId: user.id } })).toBe(0)
  })
})
