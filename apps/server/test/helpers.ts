import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { PrismaService } from '../src/common/prisma.service'
import { RedisService } from '../src/common/redis.service'
import { NotificationService } from '../src/common/notification/notification.service'
import { WechatPayService } from '../src/modules/payment/wechat-pay.service'
import { PricingService } from '../src/modules/pricing/pricing.service'
import { EnrollmentService } from '../src/modules/order/enrollment.service'
import { OrderService } from '../src/modules/order/order.service'
import { OrderController } from '../src/modules/order/order.controller'
import { PaymentService } from '../src/modules/payment/payment.service'
import { WaitlistService } from '../src/modules/waitlist/waitlist.service'

/**
 * Redis mock：
 * - withLock 直接执行 fn（测试内串行，无需真实分布式锁）
 * - lockSeat 恒成功、其余为 no-op
 */
export function createRedisMock() {
  const store = new Map<string, string>()
  return {
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string) => {
      store.set(k, v)
    },
    del: async (k: string) => {
      store.delete(k)
    },
    lockSeat: async () => true,
    unlockSeat: async () => undefined,
    getSeatLockTTL: async () => -1,
    acquireLock: async () => true,
    releaseLock: async () => undefined,
    withLock: async <T>(_key: string, fn: () => Promise<T>) => fn(),
  }
}

/**
 * 微信支付 mock：
 * - refund 不发起真实网络请求
 * - decryptNotify 直接 JSON.parse，便于用例构造支付/退款回调报文
 */
export function createWechatPayMock() {
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
      { provide: WechatPayService, useValue: createWechatPayMock() },
      { provide: NotificationService, useValue: createNotificationMock() },
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
 * 所有金额单位为「元」。
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
      data: { userId: user.id, displayName: '测试导师', specialties: ['yoga'] },
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
    const startDate = new Date(Date.now() + (opts.startInHours ?? 240) * 3600 * 1000)
    const endDate = new Date(startDate.getTime() + 3600 * 1000)
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
        startTime: opts.startTime ?? '10:00',
        endTime: opts.endTime ?? '11:00',
        trainerId: trainer.id,
        minCapacity: 1,
        maxCapacity: opts.maxCapacity ?? 5,
        currentEnrolled: opts.currentEnrolled ?? 0,
        originalPrice: opts.originalPrice ?? 100,
        venueId,
        status: opts.status ?? 'PUBLISHED',
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

/** 构造退款回调报文（decryptNotify mock 会 JSON.parse） */
export function refundNotify(orderId: string) {
  return JSON.stringify({ out_trade_no: orderId, refund_status: 'SUCCESS' })
}

/** 构造支付回调报文 */
export function payNotify(orderId: string, txId = 'TX_TEST') {
  return JSON.stringify({
    out_trade_no: orderId,
    transaction_id: txId,
    trade_state: 'SUCCESS',
  })
}
