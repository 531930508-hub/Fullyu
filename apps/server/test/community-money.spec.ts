import { buildTestContext, Seeder, TestContext, payNotify, refundNotify } from './helpers'
import { CommunityService } from '../src/modules/community/community.service'
import { RedisService } from '../src/common/redis.service'
import { OrderTasksService } from '../src/modules/order/order-tasks.service'
import { BusinessException } from '../src/common/exceptions/business.exception'

/**
 * 社群年费资金链路：
 * - 待支付订单 15 分钟内复用，超时可重新下单
 * - 平台服务费按实付 10% 计提
 * - 支付开通一年、重复加入不重复计数
 * - 退款只撤销本单贡献：续费退款保留此前有效期
 * - 免年费/减免邀请的 0 元权益与强制退款撤销
 * - 付费有效期内禁止自助退群；超时订单取消不产生会员关系
 */
describe('社群年费资金链路与权益', () => {
  let ctx: TestContext
  let seeder: Seeder
  let communityService: CommunityService
  let orderTasks: OrderTasksService
  let communityId: string
  const communityIds: string[] = []

  async function newCommunity(yearlyFee = 10000, joinMode: 'OPEN' | 'INVITE' | 'APPROVAL' = 'OPEN') {
    const community = await ctx.prisma.community.create({
      data: {
        name: `测试社群${Date.now()}${Math.floor(Math.random() * 1000)}`,
        tags: '[]',
        yearlyFee,
        joinMode,
        status: 'APPROVED',
        isActive: true,
        visibility: 'PUBLIC',
        memberCount: 0,
      },
    })
    communityId = community.id
    communityIds.push(community.id)
    return community
  }

  beforeAll(async () => {
    ctx = await buildTestContext()
    seeder = new Seeder(ctx.prisma)
    const redis = ctx.moduleRef.get(RedisService)
    communityService = new CommunityService(ctx.prisma, redis)
    orderTasks = new OrderTasksService(ctx.prisma, redis)
    await newCommunity()
  })

  afterAll(async () => {
    await seeder.cleanup()
    // 订单已由 seeder 按用户清理，再删社群（邀请/领取/成员关系级联删除）
    await ctx.prisma.community.deleteMany({ where: { id: { in: communityIds } } })
    await ctx.app.close()
  })

  const getOrder = (id: string) => ctx.prisma.order.findUnique({ where: { id } })
  const getJoin = (community: string, userId: string) =>
    ctx.prisma.communityJoin.findUnique({
      where: { communityId_userId: { communityId: community, userId } },
    })

  it('待支付订单 15 分钟内复用，平台服务费按实付 10%', async () => {
    const user = await seeder.user()
    const first = await communityService.join(communityId, user.id)
    expect(first.requiresPayment).toBe(true)
    const order = await getOrder(first.orderId!)
    expect(order!.status).toBe('PENDING_PAYMENT')
    expect(Number(order!.actualPaid)).toBe(10000)
    expect(Number(order!.platformFee)).toBe(1000)

    const second = await communityService.join(communityId, user.id)
    expect(second.orderId).toBe(first.orderId)

    // 超过 15 分钟后重新下单
    await ctx.prisma.order.update({
      where: { id: first.orderId! },
      data: { createdAt: new Date(Date.now() - 16 * 60 * 1000) },
    })
    const third = await communityService.join(communityId, user.id)
    expect(third.orderId).not.toBe(first.orderId)
    await ctx.prisma.order.update({
      where: { id: third.orderId! },
      data: { status: 'CANCELLED' },
    })
  })

  it('支付成功开通一年，重复加入不重复计数', async () => {
    const user = await seeder.user()
    const joined = await communityService.join(communityId, user.id)
    await ctx.payment.handleNotify(payNotify(joined.orderId!, 'TX_COMMUNITY'))

    const order = await getOrder(joined.orderId!)
    expect(order!.status).toBe('PAID')
    const join = await getJoin(communityId, user.id)
    expect(join!.source).toBe('PAID')
    const days = Math.round((join!.paidUntil!.getTime() - Date.now()) / 86400000)
    expect(days).toBeGreaterThanOrEqual(364)
    expect((await ctx.prisma.community.findUnique({ where: { id: communityId } }))!.memberCount).toBe(1)

    const again = await communityService.join(communityId, user.id)
    expect(again.joined).toBe(true)
    expect(again.requiresPayment).toBe(false)
    expect((await ctx.prisma.community.findUnique({ where: { id: communityId } }))!.memberCount).toBe(1)
  })

  it('续费后退款保留此前有效期，最后一笔退款后失效', async () => {
    const user = await seeder.user()
    const community = await newCommunity()

    const first = await communityService.join(community.id, user.id)
    await ctx.payment.fulfillPaidOrder(first.orderId!, 'TX_COMMUNITY_Y1')

    // 有效期内暂不支持前端续费，直接构造第二笔已支付年费订单验证重算口径
    const renewNo = await ctx.order.generateOrderNo('COMMUNITY')
    const renew = await ctx.prisma.order.create({
      data: {
        orderNo: renewNo,
        userId: user.id,
        communityId: community.id,
        orderType: 'COMMUNITY',
        originalPrice: 10000,
        actualPaid: 10000,
        platformFee: 1000,
        status: 'PENDING_PAYMENT',
      },
    })
    await ctx.payment.fulfillPaidOrder(renew.id, 'TX_COMMUNITY_Y2')

    const twoYears = await getJoin(community.id, user.id)
    const twoYearDays = Math.round((twoYears!.paidUntil!.getTime() - Date.now()) / 86400000)
    expect(twoYearDays).toBeGreaterThanOrEqual(729)

    await ctx.payment.refundFull(renew.id, '续费退订')
    await ctx.payment.handleRefundNotify(refundNotify(renew.id))
    const oneYear = await getJoin(community.id, user.id)
    const oneYearDays = Math.round((oneYear!.paidUntil!.getTime() - Date.now()) / 86400000)
    expect(oneYearDays).toBeGreaterThanOrEqual(364)
    expect(oneYearDays).toBeLessThan(367)

    await ctx.payment.refundFull(first.orderId!, '年费退款')
    await ctx.payment.handleRefundNotify(refundNotify(first.orderId!))
    const none = await getJoin(community.id, user.id)
    expect(none!.paidUntil).toBeNull()

    // 权益失效后再次加入需重新付费
    const retry = await communityService.join(community.id, user.id)
    expect(retry.requiresPayment).toBe(true)
  })

  it('免年费邀请：0 元订单直接开通，权益只核销一次', async () => {
    const user = await seeder.user()
    const community = await newCommunity()
    const invite = await ctx.prisma.communityInvite.create({
      data: {
        communityId: community.id,
        name: '免年费礼遇',
        kind: 'WAIVER',
        amount: 0,
        quota: 0,
        isActive: true,
      },
    })
    await ctx.prisma.communityInviteClaim.create({
      data: { inviteId: invite.id, communityId: community.id, userId: user.id },
    })

    const joined = await communityService.join(community.id, user.id)
    expect(joined.joined).toBe(true)
    expect((joined as any).zeroPriceEntitlement).toBe(true)
    const order = await getOrder(joined.orderId!)
    expect(order!.status).toBe('PAID')
    expect(Number(order!.actualPaid)).toBe(0)
    expect(Number(order!.platformFee)).toBe(0)
    const join = await getJoin(community.id, user.id)
    expect(join!.source).toBe('WAIVER')
    expect(join!.paidUntil).not.toBeNull()
    const claim = await ctx.prisma.communityInviteClaim.findFirst({ where: { inviteId: invite.id } })
    expect(claim!.usedAt).not.toBeNull()
    expect((await ctx.prisma.communityInvite.findUnique({ where: { id: invite.id } }))!.usedCount).toBe(1)

    await communityService.join(community.id, user.id)
    expect(
      await ctx.prisma.order.count({
        where: { userId: user.id, communityId: community.id, orderType: 'COMMUNITY' },
      }),
    ).toBe(1)
  })

  it('减免邀请：按减免金额支付并记录优惠来源', async () => {
    const user = await seeder.user()
    const community = await newCommunity()
    const invite = await ctx.prisma.communityInvite.create({
      data: {
        communityId: community.id,
        name: '立减十元',
        kind: 'REDUCE',
        amount: 1000,
        quota: 0,
        isActive: true,
      },
    })
    await ctx.prisma.communityInviteClaim.create({
      data: { inviteId: invite.id, communityId: community.id, userId: user.id },
    })

    const joined = await communityService.join(community.id, user.id)
    expect(joined.requiresPayment).toBe(true)
    const order = await getOrder(joined.orderId!)
    expect(Number(order!.actualPaid)).toBe(9000)
    expect(Number(order!.discountAmount)).toBe(1000)
    expect(Number(order!.platformFee)).toBe(900)

    await ctx.payment.fulfillPaidOrder(joined.orderId!, 'TX_COUPON')
    const join = await getJoin(community.id, user.id)
    expect(join!.source).toBe('COUPON')
  })

  it('0 元免年费订单强制退款后权益失效', async () => {
    const user = await seeder.user()
    const community = await newCommunity()
    const invite = await ctx.prisma.communityInvite.create({
      data: {
        communityId: community.id,
        name: '免年费礼遇',
        kind: 'WAIVER',
        amount: 0,
        quota: 0,
        isActive: true,
      },
    })
    await ctx.prisma.communityInviteClaim.create({
      data: { inviteId: invite.id, communityId: community.id, userId: user.id },
    })
    const joined = await communityService.join(community.id, user.id)

    await ctx.payment.forceRefund(joined.orderId!, 0, '误发权益回收')

    expect((await getOrder(joined.orderId!))!.status).toBe('REFUNDED')
    expect((await getJoin(community.id, user.id))!.paidUntil).toBeNull()
    const retry = await communityService.join(community.id, user.id)
    expect(retry.requiresPayment).toBe(true)
  })

  it('付费有效期内禁止自助退群，过期后可退出', async () => {
    const user = await seeder.user()
    const community = await newCommunity()
    const joined = await communityService.join(community.id, user.id)
    await ctx.payment.fulfillPaidOrder(joined.orderId!, 'TX_COMMUNITY_LEAVE')

    await expect(communityService.leave(community.id, user.id)).rejects.toBeInstanceOf(
      BusinessException,
    )
    expect(await getJoin(community.id, user.id)).not.toBeNull()

    await ctx.prisma.communityJoin.updateMany({
      where: { communityId: community.id, userId: user.id },
      data: { paidUntil: new Date(Date.now() - 60 * 1000) },
    })
    await communityService.leave(community.id, user.id)
    expect(await getJoin(community.id, user.id)).toBeNull()
    expect((await ctx.prisma.community.findUnique({ where: { id: community.id } }))!.memberCount).toBe(0)
  })

  it('待支付年费订单超时取消不产生会员关系', async () => {
    const user = await seeder.user()
    const community = await newCommunity()
    const joined = await communityService.join(community.id, user.id)
    await ctx.prisma.order.update({
      where: { id: joined.orderId! },
      data: { createdAt: new Date(Date.now() - 11 * 60 * 1000) },
    })

    await orderTasks.cancelExpiredOrders()

    expect((await getOrder(joined.orderId!))!.status).toBe('CANCELLED')
    expect(await getJoin(community.id, user.id)).toBeNull()
    expect((await ctx.prisma.community.findUnique({ where: { id: community.id } }))!.memberCount).toBe(0)
  })
})
