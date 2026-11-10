import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { PrismaService } from '../src/common/prisma.service'
import { RedisService } from '../src/common/redis.service'
import { NotificationService } from '../src/common/notification/notification.service'
import { HuifuPayService } from '../src/modules/payment/huifu-pay.service'
import { PricingService } from '../src/modules/pricing/pricing.service'
import { EnrollmentService } from '../src/modules/order/enrollment.service'
import { OrderService } from '../src/modules/order/order.service'
import { OrderController } from '../src/modules/order/order.controller'
import { PaymentService } from '../src/modules/payment/payment.service'
import { WaitlistService } from '../src/modules/waitlist/waitlist.service'
import { BrandPresenceSync } from '../src/modules/member/brand-presence.sync'

/**
 * Redis mock：
 * - withLock 直接执行 fn（测试内串行，无需真实分布式锁）
 * - lockSeat 恒成功、其余为 no-op
 */
export function createRedisMock() {
  const store = new Map<string, string>()
  const counters = new Map<string, number>()
  // 并行 suite 共用测试库，但各自 new 一个 mock；若计数器都从 1 起，
  // 生成的订单号（前缀+日期+5 位流水）会撞 orders_order_no_key 唯一约束。
  // 生产用真实共享 Redis INCR 不受影响，这里给每个实例一个随机基址隔离即可。
  const base = Math.floor(Math.random() * 90000) + 1
  return {
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string) => {
      store.set(k, v)
    },
    del: async (k: string) => {
      store.delete(k)
    },
    incr: async (k: string) => {
      const next = (counters.get(k) ?? 0) + 1
      counters.set(k, next)
      return base + next
    },
    expire: async () => undefined,
    lockSeat: async () => true,
    unlockSeat: async () => undefined,
    getSeatLockTTL: async () => -1,
    acquireLock: async () => true,
    releaseLock: async () => undefined,
    withLock: async <T>(_key: string, fn: () => Promise<T>) => fn(),
  }
}

/**
 * 汇付支付 mock：
 * - refund 不发起真实网络请求
 * - decryptNotify 直接 JSON.parse，便于用例构造支付/退款回调报文
 */
export function createHuifuPayMock() {
  return {
    createJsapiOrder: async () => ({
      appId: 'wx_test',
      timeStamp: '0',
      nonceStr: 'nonce',
      package: 'prepay_id=test',
      signType: 'RSA',
      paySign: 'sign',
    }),
    refund: async () => ({ refund_id: 'RF_TEST', status: 'PROCESSING' }),
    decryptNotify: (raw: string) => JSON.parse(raw),
    buildNotifyAck: (reqSeqId: string) => `RECV_ORD_ID_${reqSeqId}`,
  }
}

/** 通知服务 mock：全部 no-op，避免调用微信订阅消息 */
export function createNotificationMock() {
  return {
    courseReminder: async () => undefined,
    waitlistPromoted: async () => undefined,
    paymentSuccess: async () => undefined,
    refundSuccess: async () => undefined,
  }
}

/**
 * 品牌会员同步 mock：
 * PaymentService 构造时需要 BrandPresenceSync，真实实例负责定时任务与 CRM 上报，
 * 单测里不启动定时器、不发请求，支付成功后立即同步直接返回空结果。
 */
export function createBrandSyncMock() {
  return {
    syncUser: async () => ({
      bundled: 0,
      revoked: 0,
      reported: 0,
      refunded: 0,
      skipped: 0,
      missing: 0,
      failed: 0,
    }),
  }
}

/** HTTP 冒烟用：可变的当前登录用户，测试前赋值，Guard 从中读取 */
export const currentUser: { userId: string } = { userId: '' }

export interface TestContext {
  moduleRef: TestingModule
  app: INestApplication
  prisma: PrismaService
  pricing: PricingService
  enrollment: EnrollmentService
  order: OrderService
  payment: PaymentService
  waitlist: WaitlistService
}

/**
 * 手动组装最小测试模块：真实 Prisma + 真实业务 Service，mock 外部依赖。
 * 同时挂载 OrderController 并覆盖 JWT Guard，供 HTTP 冒烟使用。
 * 组装成功即验证了 payment ⇄ waitlist 的 forwardRef 循环依赖在运行时可解析。
 */
export async function buildTestContext(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({
    controllers: [OrderController],
    providers: [
      PrismaService,
      PricingService,
      EnrollmentService,
      OrderService,
      PaymentService,
      WaitlistService,
      { provide: RedisService, useValue: createRedisMock() },
      { provide: HuifuPayService, useValue: createHuifuPayMock() },
      { provide: NotificationService, useValue: createNotificationMock() },
      { provide: BrandPresenceSync, useValue: createBrandSyncMock() },
    ],
  })
    .overrideGuard(AuthGuard('jwt'))
    .useValue({
      canActivate: (ctx: any) => {
        const req = ctx.switchToHttp().getRequest()
        req.user = { userId: currentUser.userId }
        return true
      },
    })
    .compile()

  const app = moduleRef.createNestApplication()
  await app.init()

  return {
    moduleRef,
    app,
    prisma: moduleRef.get(PrismaService),
    pricing: moduleRef.get(PricingService),
    enrollment: moduleRef.get(EnrollmentService),
    order: moduleRef.get(OrderService),
    payment: moduleRef.get(PaymentService),
    waitlist: moduleRef.get(WaitlistService),
  }
}

/**
 * 测试数据播种器：按外键顺序创建实体并记录 id，afterAll 反向清理。
 * 课程链金额（originalPrice / tiers）单位为「分」；积分单位为「个」。
 */
export class Seeder {
  private venueIds: string[] = []
  private trainerIds: string[] = []
  private userIds: string[] = []
  private courseIds: string[] = []

  constructor(private readonly prisma: PrismaService) {}

  private uniq() {
    return `${Date.now()}${Math.floor(Math.random() * 100000)}`
  }

  async user(opts: { openId?: boolean } = {}) {
    const u = this.uniq()
    const user = await this.prisma.user.create({
      data: {
        phone: `T${u}`.slice(0, 20),
        nickname: `测试用户${u.slice(-5)}`,
        openId: opts.openId ? `openid_${u}` : undefined,
      },
    })
    this.userIds.push(user.id)
    return user
  }

  async trainer() {
    const user = await this.user()
    const tp = await this.prisma.trainerProfile.create({
      data: { userId: user.id, displayName: `测试导师${this.uniq()}`, specialties: ['yoga'] },
    })
    this.trainerIds.push(tp.id)
    return tp
  }

  async venue() {
    const v = await this.prisma.venue.create({
      data: {
        name: `测试场地${this.uniq().slice(-5)}`,
        address: '测试地址',
        images: [],
        businessHours: '{}',
      },
    })
    this.venueIds.push(v.id)
    return v
  }

  /**
   * 创建课程（默认已发布、开启候补）。
   * @param opts.tiers 阶梯价 [{seatFrom,seatTo,price}]
   * @param opts.memberDiscounts 会员折扣 [{cardType,discountPercent}]
   * @param opts.refundRules 退款规则 [{hoursFrom,hoursTo,refundPercent}]
   * @param opts.startInHours 距开课小时数（用于退款规则命中），默认 240（10 天后）
   * @param opts.venueId 指定场地（不传则新建一个，用于场地冲突用例）
   * @param opts.startTime/endTime 上课时间（HH:mm，用于时间重叠用例）
   */
  async course(opts: {
    maxCapacity?: number
    currentEnrolled?: number
    originalPrice?: number
    status?: 'DRAFT' | 'PUBLISHED'
    waitlistEnabled?: boolean
    memberWaitlistSeats?: number
    allowDeduction?: boolean
    startInHours?: number
    minCapacity?: number
    groupDeadline?: Date | null
    waitlistDeadlineHours?: number
    startDate?: Date
    endDate?: Date
    enrollStartAt?: Date
    enrollEndAt?: Date
    venueId?: string
    startTime?: string
    endTime?: string
    tiers?: { seatFrom: number; seatTo: number; price: number }[]
    memberDiscounts?: { cardType: 'MONTHLY' | 'QUARTERLY' | 'YEARLY'; discountPercent: number }[]
    refundRules?: { hoursFrom: number; hoursTo: number | null; refundPercent: number }[]
  } = {}) {
    const trainer = await this.trainer()
    const venueId = opts.venueId ?? (await this.venue()).id
    const startDate = opts.startDate ?? new Date(Date.now() + (opts.startInHours ?? 240) * 3600 * 1000)
    const endDate = opts.endDate ?? new Date(startDate.getTime() + 3600 * 1000)
    // 生产口径：startDate 存日期、startTime 存 HH:mm，真实开课时刻由两者拼出。
    // 用 startInHours 造“已开课/已结束”时，若仍固定 10:00，凌晨 0–2 点会落到未来而误判未开课；
    // 因此未显式给 startTime/endTime 时，从 startDate/endDate 取上海时区的时刻。
    const clock = (at: Date) => {
      const local = new Date(at.getTime() + 8 * 3600 * 1000)
      const pad = (v: number) => String(v).padStart(2, '0')
      return `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`
    }
    const course = await this.prisma.course.create({
      data: {
        title: `测试课程${this.uniq().slice(-5)}`,
        coverImage: 'cover',
        type: 'SINGLE',
        categories: ['test'],
        description: '测试课程',
        targetAudience: ['all'],
        startDate,
        endDate,
        startTime: opts.startTime ?? clock(startDate),
        endTime: opts.endTime ?? clock(endDate),
        trainerId: trainer.id,
        minCapacity: opts.minCapacity ?? 1,
        maxCapacity: opts.maxCapacity ?? 5,
        currentEnrolled: opts.currentEnrolled ?? 0,
        originalPrice: opts.originalPrice ?? 100,
        venueId,
        status: opts.status ?? 'PUBLISHED',
        groupDeadline: opts.groupDeadline ?? undefined,
        waitlistDeadlineHours: opts.waitlistDeadlineHours ?? undefined,
        enrollStartAt: opts.enrollStartAt ?? undefined,
        enrollEndAt: opts.enrollEndAt ?? undefined,
        allowDeduction: opts.allowDeduction ?? true,
        waitlistEnabled: opts.waitlistEnabled ?? true,
        memberWaitlistSeats: opts.memberWaitlistSeats ?? 3,
        refundRules: opts.refundRules ?? undefined,
        gallery: [],
        weekdays: [],
      },
    })
    this.courseIds.push(course.id)

    if (opts.tiers?.length) {
      for (const t of opts.tiers) {
        await this.prisma.coursePriceTier.create({
          data: { courseId: course.id, seatFrom: t.seatFrom, seatTo: t.seatTo, price: t.price },
        })
      }
    }
    if (opts.memberDiscounts?.length) {
      for (const d of opts.memberDiscounts) {
        await this.prisma.courseMemberDiscount.create({
          data: { courseId: course.id, cardType: d.cardType, discountPercent: d.discountPercent },
        })
      }
    }
    return this.prisma.course.findUnique({ where: { id: course.id }, include: { priceTiers: true } })
  }

  /** 创建手动场地预约（courseId 为空，模拟后台手工预约） */
  async reservation(opts: {
    venueId: string
    startInHours?: number
    startTime?: string
    endTime?: string
    eventName?: string
  }) {
    const date = new Date(Date.now() + (opts.startInHours ?? 240) * 3600 * 1000)
    date.setHours(0, 0, 0, 0)
    return this.prisma.venueReservation.create({
      data: {
        venueId: opts.venueId,
        date,
        startTime: opts.startTime ?? '10:00',
        endTime: opts.endTime ?? '11:00',
        eventName: opts.eventName ?? '手动预约',
        contactName: '测试',
        contactPhone: '',
      },
    })
  }

  async memberCard(userId: string, type: 'MONTHLY' | 'QUARTERLY' | 'YEARLY' = 'YEARLY') {
    const now = new Date()
    return this.prisma.memberCard.create({
      data: {
        userId,
        type,
        status: 'ACTIVE',
        startDate: now,
        endDate: new Date(now.getTime() + 365 * 24 * 3600 * 1000),
      },
    })
  }

  async addPoints(userId: string, amount: number) {
    return this.prisma.pointsRecord.create({
      data: { userId, amount, balance: amount, type: 'ADMIN_ADJUST', reason: '测试充值' },
    })
  }

  /** 反向清理所有自建数据 */
  async cleanup() {
    await this.prisma.venueReservation.deleteMany({ where: { venueId: { in: this.venueIds } } })
    await this.prisma.waitlistEntry.deleteMany({ where: { courseId: { in: this.courseIds } } })
    await this.prisma.orderRefund.deleteMany({ where: { order: { userId: { in: this.userIds } } } })
    await this.prisma.order.deleteMany({ where: { courseId: { in: this.courseIds } } })
    await this.prisma.order.deleteMany({ where: { userId: { in: this.userIds } } })
    await this.prisma.pointsRecord.deleteMany({ where: { userId: { in: this.userIds } } })
    await this.prisma.voucher.deleteMany({ where: { userId: { in: this.userIds } } })
    await this.prisma.memberCard.deleteMany({ where: { userId: { in: this.userIds } } })
    await this.prisma.courseMemberDiscount.deleteMany({ where: { courseId: { in: this.courseIds } } })
    await this.prisma.coursePriceTier.deleteMany({ where: { courseId: { in: this.courseIds } } })
    await this.prisma.course.deleteMany({ where: { id: { in: this.courseIds } } })
    await this.prisma.trainerProfile.deleteMany({ where: { id: { in: this.trainerIds } } })
    await this.prisma.venue.deleteMany({ where: { id: { in: this.venueIds } } })
    await this.prisma.user.deleteMany({ where: { id: { in: this.userIds } } })
  }
}

/** 构造退款回调报文（decryptNotify mock 会 JSON.parse）。
 * reqSeqId 对应退款流水 out_refund_no：新退款流水按此结算（部分/整单），
 * 不传则走旧版整单结算路径（兼容存量退款）。 */
export function refundNotify(orderId: string, txId = 'TX_TEST', reqSeqId?: string) {
  return JSON.stringify({
    out_trade_no: orderId,
    transaction_id: txId,
    refund_status: 'SUCCESS',
    ...(reqSeqId ? { req_seq_id: reqSeqId } : {}),
  })
}

/** 构造支付回调报文 */
export function payNotify(orderId: string, txId = 'TX_TEST') {
  return JSON.stringify({
    out_trade_no: orderId,
    transaction_id: txId,
    trade_state: 'SUCCESS',
  })
}
